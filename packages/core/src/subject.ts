// Reply/forward prefixes in common mail clients and languages:
// Re, Fw, Fwd, Aw (de), Sv (sv/da/no), Vs (fi), Wg (de), Tr (fr), Rv (es), Enc (pt), Antw (nl), Ref, 回复/转发 (zh).
const PREFIX = /^\s*(?:(?:re|fwd?|aw|sv|vs|wg|tr|rv|enc|antw|ref|回复|回覆|转发|轉寄)(?:\s*\[\d+\]|\s*\(\d+\))?\s*[:：]\s*|\[[^\]]{1,40}\]\s*)/i;

/** Subject with reply/forward prefixes and list tags removed, whitespace collapsed, lowercased. Used for thread fallback matching. */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").replace(/\s+/g, " ").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(PREFIX, "");
  } while (s !== prev);
  return s.trim().toLowerCase();
}
