import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { ApiError } from "./errors";
import type { AppEnv, AuthContext } from "./types";

/**
 * Named limits. Each runtime configures the numbers in its limiter (wrangler.jsonc's `ratelimits`
 * on Cloudflare, RATE_LIMITS for the in-memory limiter), so routes only say which rule applies.
 *
 *   key       every request authenticated by an API key (or a dashboard user)
 *   key_send  additionally, the requests that send mail
 *   ip        requests that fail authentication or carry no key, and signed file links
 */
export type RateRule = "key" | "key_send" | "ip";

export interface RateLimiter {
  /** Counts one request against `key` under `rule`. `retryAfter` is in seconds and only meaningful when not ok. */
  limit(key: string, rule: RateRule): Promise<{ ok: boolean; retryAfter: number }>;
}

/** Requests per window. wrangler.jsonc's `ratelimits` repeat these for the Cloudflare binding. */
export const RATE_LIMITS: Record<RateRule, { limit: number; periodSeconds: number }> = {
  key: { limit: 600, periodSeconds: 60 },
  key_send: { limit: 60, periodSeconds: 60 },
  ip: { limit: 60, periodSeconds: 60 },
};

/**
 * Fixed-window counters in memory. Exact on one Node process; on Workers it is per isolate, so a
 * weaker fallback for when the Rate Limiting binding is missing. The map is bounded: expired
 * windows are dropped as they are seen, and past `maxEntries` the oldest entries go first.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { windowStart: number; count: number }>();
  private readonly rules: Record<RateRule, { limit: number; periodSeconds: number }>;
  private readonly maxEntries: number;
  private readonly now: () => number;
  /** A window older than the longest period is expired under every rule. */
  private readonly longestMs: number;

  constructor(opts: { rules?: Partial<typeof RATE_LIMITS>; maxEntries?: number; now?: () => number } = {}) {
    this.rules = { ...RATE_LIMITS, ...opts.rules };
    this.maxEntries = opts.maxEntries ?? 50_000;
    this.now = opts.now ?? Date.now;
    this.longestMs = Math.max(...Object.values(this.rules).map((r) => r.periodSeconds)) * 1000;
  }

  async limit(key: string, rule: RateRule): Promise<{ ok: boolean; retryAfter: number }> {
    const { limit, periodSeconds } = this.rules[rule];
    const period = periodSeconds * 1000;
    const at = this.now();
    const id = `${rule}:${key}`;
    let w = this.windows.get(id);
    if (!w || at - w.windowStart >= period) {
      this.windows.delete(id);
      w = { windowStart: at, count: 0 };
      this.evict(at);
    } else {
      // Re-insert so Map order tracks recent use: the first entries are the least recently seen.
      this.windows.delete(id);
    }
    this.windows.set(id, w);
    w.count++;
    if (w.count <= limit) return { ok: true, retryAfter: 0 };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.windowStart + period - at) / 1000)) };
  }

  /** Entries currently tracked (for tests). */
  get size(): number {
    return this.windows.size;
  }

  /** Makes room for one more entry: expired windows from the old end first, then the least recently seen. */
  private evict(at: number): void {
    for (const [id, w] of this.windows) {
      if (this.windows.size < this.maxEntries && at - w.windowStart < this.longestMs) break;
      this.windows.delete(id);
    }
  }
}

/** The Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Cloudflare's Rate Limiting bindings, one per rule. A binding that is missing at runtime (an
 * account or plan without them) falls back to `fallback`, so limiting degrades instead of failing.
 */
export function bindingRateLimiter(bindings: Partial<Record<RateRule, RateLimitBinding | undefined>>, fallback: RateLimiter): RateLimiter {
  return {
    async limit(key, rule) {
      const binding = bindings[rule];
      if (!binding) return fallback.limit(key, rule);
      const { success } = await binding.limit({ key });
      // The binding doesn't say when its window ends; the period is the safe upper bound.
      return { ok: success, retryAfter: success ? 0 : RATE_LIMITS[rule].periodSeconds };
    },
  };
}

/**
 * Requests the API makes to itself (the remote MCP server's tools). The outer /mcp request has
 * already counted against the key, so these skip the `key` rule; sends still count.
 */
const internalRequests = new WeakSet<Request>();
export function markInternal(request: Request): Request {
  internalRequests.add(request);
  return request;
}

export const rateLimited = (retryAfter: number) =>
  new ApiError(429, "rate_limited", `Too many requests. Slow down and retry after ${retryAfter} seconds.`, undefined, {
    "retry-after": String(retryAfter),
  });

async function enforce(c: Context<AppEnv>, key: string, rule: RateRule): Promise<void> {
  const limiter = c.get("deps").rateLimiter;
  if (!limiter) return;
  const { ok, retryAfter } = await limiter.limit(key, rule);
  if (!ok) throw rateLimited(retryAfter);
}

/** Dashboard members are limited per person, API keys per key. */
const callerKey = (auth: AuthContext) => (auth.actor === "user" ? `user:${auth.keyId}` : `key:${auth.keyId}`);

/** The `key` rule, for a caller that has just authenticated. */
export async function limitCaller(c: Context<AppEnv>, auth: AuthContext): Promise<void> {
  if (internalRequests.has(c.req.raw)) return;
  await enforce(c, callerKey(auth), "key");
}

/** The `ip` rule. Skipped when the client address is unknown (an in-process request). */
export async function limitIp(c: Context<AppEnv>): Promise<void> {
  const ip = c.req.header("cf-connecting-ip");
  if (ip) await enforce(c, `ip:${ip}`, "ip");
}

/** The `key_send` rule, on routes that send mail. Runs after authentication. */
export const limitSends = createMiddleware<AppEnv>(async (c, next) => {
  await enforce(c, callerKey(c.get("auth")), "key_send");
  await next();
});

/** The `ip` rule as middleware, for routes without API-key auth. */
export const limitByIp = createMiddleware<AppEnv>(async (c, next) => {
  await limitIp(c);
  await next();
});
