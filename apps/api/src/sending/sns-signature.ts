import { spkiFromPem } from "./x509";

/**
 * Amazon SNS message signature verification, per
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html.
 * Uses only WebCrypto and fetch, so it runs the same on Workers and Node.
 */

/** Outcome of {@link verifySnsMessage}; `reason` is a short machine-readable code safe to log. */
export type SnsVerifyResult = { ok: true } | { ok: false; reason: string };

/** Overrides for tests; production uses the globals and a module-level cache. */
export interface SnsVerifyOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  certCache?: Map<string, CryptoKey>;
}

const HASHES: Record<string, "SHA-1" | "SHA-256"> = { "1": "SHA-1", "2": "SHA-256" };
const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;
const MAX_AGE_MS = 60 * 60_000;
const MAX_SKEW_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_CERT_BYTES = 64 * 1024;
const CACHE_LIMIT = 20;

/** Imported keys by `${hash} ${url}`, so a warm isolate doesn't refetch the certificate. */
const defaultCache = new Map<string, CryptoKey>();

const SIGNED_FIELDS: Record<string, readonly string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};
const OPTIONAL_FIELDS = new Set(["Subject"]);

const fail = (reason: string): SnsVerifyResult => ({ ok: false, reason });

/**
 * Builds the string SNS signs: "Key\nValue\n" for each signed field in order. Subject is
 * included only when present. Returns null for an unknown Type or a missing required field.
 */
export function snsStringToSign(msg: Record<string, unknown>): string | null {
  const fields = SIGNED_FIELDS[String(msg.Type)];
  if (!fields) return null;
  let out = "";
  for (const key of fields) {
    const value = msg[key];
    if (value === undefined && OPTIONAL_FIELDS.has(key)) continue;
    if (typeof value !== "string") return null;
    out += `${key}\n${value}\n`;
  }
  return out;
}

/** True when the URL is an https SNS host serving a .pem, with nothing that could redirect the fetch elsewhere. */
function isSnsCertUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    CERT_HOST.test(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname.endsWith(".pem")
  );
}

function decodeBase64(b64: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Fetches the certificate with a timeout and a size cap; returns null on any failure. */
async function fetchCertificate(url: string, doFetch: typeof fetch): Promise<string | null> {
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "manual" });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return null;
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_CERT_BYTES) {
      await res.body.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CERT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return new TextDecoder().decode(all);
  } catch {
    return null;
  }
}

type KeyResult = { key: CryptoKey } | { reason: "cert_fetch_failed" | "bad_certificate" };

async function loadKey(url: string, hash: "SHA-1" | "SHA-256", doFetch: typeof fetch, cache: Map<string, CryptoKey>): Promise<KeyResult> {
  const cacheKey = `${hash} ${url}`;
  const cached = cache.get(cacheKey);
  if (cached) return { key: cached };

  const pem = await fetchCertificate(url, doFetch);
  if (pem === null) return { reason: "cert_fetch_failed" };
  let key: CryptoKey;
  try {
    const spki = new Uint8Array(spkiFromPem(pem));
    key = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
  } catch {
    return { reason: "bad_certificate" };
  }
  // Oldest-first eviction keeps the map bounded; SNS rotates certificates rarely, so a handful covers every region we use.
  while (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(cacheKey, key);
  return { key };
}

/**
 * Verifies an SNS message (Notification, SubscriptionConfirmation or UnsubscribeConfirmation):
 * signature version, signing-certificate URL (checked before any fetch), replay window
 * (at most 1 hour old, 5 minutes ahead), then the RSA signature over the canonical string.
 */
export async function verifySnsMessage(msg: unknown, opts: SnsVerifyOptions = {}): Promise<SnsVerifyResult> {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return fail("not_an_object");
  const m = msg as Record<string, unknown>;

  const hash = HASHES[String(m.SignatureVersion)];
  if (!hash) return fail("unsupported_signature_version");
  if (!SIGNED_FIELDS[String(m.Type)]) return fail("unsupported_type");
  if (!isSnsCertUrl(m.SigningCertURL)) return fail("bad_cert_url");

  if (typeof m.Timestamp !== "string") return fail("missing_field");
  const sentAt = Date.parse(m.Timestamp);
  if (Number.isNaN(sentAt)) return fail("bad_timestamp");
  const now = (opts.now?.() ?? new Date()).getTime();
  if (now - sentAt > MAX_AGE_MS) return fail("expired");
  if (sentAt - now > MAX_SKEW_MS) return fail("timestamp_in_future");

  const stringToSign = snsStringToSign(m);
  if (stringToSign === null) return fail("missing_field");
  const signature = typeof m.Signature === "string" ? decodeBase64(m.Signature) : null;
  if (!signature) return fail("bad_signature_encoding");

  const loaded = await loadKey(m.SigningCertURL, hash, opts.fetch ?? fetch, opts.certCache ?? defaultCache);
  if ("reason" in loaded) return fail(loaded.reason);

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", loaded.key, signature, new TextEncoder().encode(stringToSign));
  return valid ? { ok: true } : fail("signature_mismatch");
}
