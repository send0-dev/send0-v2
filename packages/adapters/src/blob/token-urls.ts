import type { SignedUrlStore } from "./types";

export interface VerifiedLink {
  key: string;
  filename: string | null;
  contentType: string | null;
}

interface Payload {
  k: string;
  e: number;
  f?: string;
  t?: string;
}

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * App-signed, expiring download links (`<baseUrl>/v1/files/<token>`) for stores that can't pre-sign.
 * The API serves them itself; the token is the credential. Works on Workers and Node (WebCrypto only).
 */
export class TokenUrlSigner implements SignedUrlStore {
  private readonly baseUrl: string;
  private readonly secret: string;
  private keyPromise?: Promise<CryptoKey>;

  constructor(opts: { secret: string; baseUrl: string }) {
    if (opts.secret.length < 32) throw new Error("TokenUrlSigner secret must be at least 32 characters");
    this.secret = opts.secret;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  }

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= crypto.subtle.importKey("raw", enc.encode(this.secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    return this.keyPromise;
  }

  async signedGetUrl(key: string, opts: { expiresIn: number; filename?: string | null; contentType?: string }): Promise<string> {
    const payload: Payload = {
      k: key,
      e: Math.floor(Date.now() / 1000) + opts.expiresIn,
      ...(opts.filename ? { f: opts.filename } : {}),
      ...(opts.contentType ? { t: opts.contentType } : {}),
    };
    const body = toBase64Url(enc.encode(JSON.stringify(payload)));
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await this.key(), enc.encode(body)));
    return `${this.baseUrl}/v1/files/${body}.${toBase64Url(sig)}`;
  }

  /** The link's contents, or null if it is malformed, forged, signed with another secret, or expired. */
  async verify(token: string, now: Date = new Date()): Promise<VerifiedLink | null> {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts as [string, string];
    const sigBytes = fromBase64Url(sig);
    if (!sigBytes || !fromBase64Url(body)) return null;
    if (!(await crypto.subtle.verify("HMAC", await this.key(), sigBytes, enc.encode(body)))) return null;
    let p: Payload;
    try {
      p = JSON.parse(new TextDecoder().decode(fromBase64Url(body)!)) as Payload;
    } catch {
      return null;
    }
    if (typeof p.k !== "string" || typeof p.e !== "number" || p.e * 1000 <= now.getTime()) return null;
    return {
      key: p.k,
      filename: typeof p.f === "string" ? p.f : null,
      contentType: typeof p.t === "string" ? p.t : null,
    };
  }
}
