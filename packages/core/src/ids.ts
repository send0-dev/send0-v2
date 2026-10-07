const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type IdPrefix = "org" | "dom" | "ibx" | "thr" | "msg" | "drf" | "att" | "whk" | "evt" | "key" | "dlv" | "usr" | "ses" | "inv";

/** Random, URL-safe id such as `msg_4Tq1x9…`. 16 base62 chars ≈ 95 bits of entropy. */
export function newId(prefix: IdPrefix, length = 16): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      // 248 is the largest multiple of 62 below 256; rejecting the rest keeps the distribution uniform.
      if (b < 248) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return `${prefix}_${out}`;
}

/** RFC 5322 Message-ID for mail we send, so replies map straight back to the message. */
export function rfcMessageId(msgId: string, domain: string): string {
  return `<${msgId}@${domain}>`;
}
