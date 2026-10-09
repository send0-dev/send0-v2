import { Send0Error } from "./errors";

export interface ClientOptions {
  /**
   * Your API key (s0_live_… or s0_test_…). Defaults to process.env.SEND0_API_KEY.
   * Pass null to send no Authorization header, for proxies that authenticate another way (e.g. a session cookie).
   */
  apiKey?: string | null;
  /** Defaults to https://api.send0.dev */
  baseUrl?: string;
  /** Retries for network errors, 429 and 5xx. POSTs are retried safely with an Idempotency-Key. Default 2. */
  maxRetries?: number;
  /** Per-request timeout in ms (wait/stream calls extend this automatically). Default 60 000. */
  timeout?: number;
  /** Custom fetch, e.g. for tests or proxies. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Override the auto-generated Idempotency-Key for POSTs. */
  idempotencyKey?: string;
  timeout?: number;
  signal?: AbortSignal;
  /** Return the raw Response instead of parsed JSON (redirects, streams). */
  raw?: boolean;
  redirect?: RequestRedirect;
  headers?: Record<string, string>;
}

const VERSION = "0.2.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class Http {
  readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions | string = {}) {
    const o = typeof opts === "string" ? { apiKey: opts } : opts;
    // Read SEND0_API_KEY where an environment exists (Node, Bun, Deno with --allow-env) without requiring Node types.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const envKey = env?.SEND0_API_KEY;
    const apiKey = o.apiKey === null ? null : (o.apiKey ?? envKey);
    if (apiKey === undefined || apiKey === "")
      throw new Send0Error("Missing API key. Pass it to new Send0(…) or set SEND0_API_KEY.", 0, "missing_api_key");
    this.apiKey = apiKey;
    this.baseUrl = (o.baseUrl ?? "https://api.send0.dev").replace(/\/$/, "");
    this.maxRetries = o.maxRetries ?? 2;
    this.timeout = o.timeout ?? 60_000;
    this.fetchImpl = o.fetch ?? ((...args) => fetch(...args));
  }

  url(path: string, query?: RequestOptions["query"]): string {
    const u = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(this.apiKey !== null ? { authorization: `Bearer ${this.apiKey}` } : {}),
      accept: "application/json",
      "user-agent": `send0-sdk-js/${VERSION}`,
    };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    Object.assign(headers, opts.headers);
    // A stable key across retries makes POST retries safe (the API replays the first response).
    if (method === "POST") headers["idempotency-key"] = opts.idempotencyKey ?? uuid();

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("timeout")), opts.timeout ?? this.timeout);
      const onAbort = () => controller.abort(opts.signal?.reason);
      opts.signal?.addEventListener("abort", onAbort);
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(path, opts.query), {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
          redirect: opts.redirect,
        });
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        if (attempt < this.maxRetries) {
          await sleep(backoff(attempt++));
          continue;
        }
        const timedOut = controller.signal.reason instanceof Error && controller.signal.reason.message === "timeout";
        throw new Send0Error(timedOut ? "Request timed out." : `Network error: ${String(err)}`, 0, timedOut ? "timeout" : "network_error");
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }

      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        attempt++;
        continue;
      }
      if (opts.raw && (res.ok || (res.status >= 300 && res.status < 400))) return res as T;
      if (!res.ok) throw await toError(res);
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
  }
}

const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);

async function toError(res: Response): Promise<Send0Error> {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  const fallback = fallbackError(res);
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; param?: string; request_id?: string } };
    const e = body.error ?? {};
    return new Send0Error(e.message ?? fallback.message, res.status, e.code ?? fallback.code, e.param, e.request_id ?? requestId);
  } catch {
    return new Send0Error(fallback.message, res.status, fallback.code, undefined, requestId);
  }
}

/**
 * For responses without a send0 error body. A 429 from Cloudflare's rate limiting in front of the
 * API is an HTML page, but callers should still see `rate_limited`.
 */
function fallbackError(res: Response): { message: string; code: string } {
  if (res.status !== 429) return { message: `HTTP ${res.status}`, code: "http_error" };
  const retryAfter = Number(res.headers.get("retry-after"));
  const when = Number.isFinite(retryAfter) && retryAfter > 0 ? `after ${retryAfter} seconds` : "later";
  return { message: `Too many requests. Slow down and retry ${when}.`, code: "rate_limited" };
}
