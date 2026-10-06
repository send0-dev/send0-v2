const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type KeyMode = "live" | "test";

export interface NewApiKey {
  /** Full secret, shown to the user exactly once: s0_live_ + 32 base62 chars (~190 bits) */
  key: string;
  /** Safe to display and store: "s0_live_AbCd" */
  prefix: string;
  /** SHA-256 hex of the full key; this is what we store and look up */
  hash: string;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export async function newApiKey(mode: KeyMode): Promise<NewApiKey> {
  const key = `s0_${mode}_${randomBase62(32)}`;
  return { key, prefix: key.slice(0, 12), hash: await sha256Hex(key) };
}

/** Cheap shape check before touching the database. */
export function looksLikeApiKey(value: string): value is `s0_${KeyMode}_${string}` {
  return /^s0_(live|test)_[0-9A-Za-z]{32}$/.test(value);
}
