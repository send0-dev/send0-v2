const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Verifies the `send0-signature` header (t=…,v1=…, HMAC-SHA256 of "t.body").
 * Pass the raw request body exactly as received. Rejects signatures older than 5 minutes.
 *
 *   const ok = await verifyWebhook(rawBody, req.headers.get("send0-signature"), process.env.SEND0_WEBHOOK_SECRET);
 */
export async function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}
