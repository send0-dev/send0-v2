const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `whsec_` + 32 random bytes as hex. */
export function newWebhookSecret(): string {
  return `whsec_${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The `send0-signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
 * Same scheme as Stripe, so existing verification code ports directly.
 */
export async function signWebhook(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

/**
 * Verifies a `send0-signature` header. Rejects signatures older than `toleranceSeconds`
 * (default 5 minutes) to stop replays. Accepts any of several v1 values (secret rotation).
 */
export async function verifyWebhook(
  secret: string,
  body: string,
  header: string | null | undefined,
  opts: { toleranceSeconds?: number; now?: number } = {},
): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}
