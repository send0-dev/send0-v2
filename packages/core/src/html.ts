const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  zwnj: "",
  zwj: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Windows-1252 characters for bytes 0x80–0x9F. Mail labelled latin1 or windows-1252 is often decoded as
// ISO-8859-1, which turns these into invisible C1 control characters (U+0080–U+009F).
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰",
  0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•",
  0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/** Repairs C1 control characters left by decoding Windows-1252 as ISO-8859-1. They never appear in real mail text. */
export function repairCp1252(s: string): string {
  return s.replace(/[\u0080-\u009f]/g, (c) => CP1252[c.charCodeAt(0)] ?? "");
}

const BLOCK = /<\/?(?:p|div|br|tr|li|ul|ol|h[1-6]|table|blockquote|section|article|header|footer|hr)\b[^>]*>/gi;

/** Readable plain text from an HTML body. Good enough for extraction and previews; not a renderer. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<td\b[^>]*>/gi, " ")
      .replace(BLOCK, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** href targets of <a> tags, in document order, entity-decoded. */
export function htmlLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const m of html.matchAll(re)) {
    const href = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (href) out.push(href);
  }
  return out;
}

/**
 * Text a human reader can't see: elements hidden with display:none, visibility:hidden,
 * zero font size or zero opacity. Prompt-injection payloads like to hide here.
 */
export function hiddenHtmlText(html: string): string {
  const hidden =
    /<(\w+)\b[^>]*\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem|%)?\s*(?:;|["'])|opacity\s*:\s*0(?:\.0+)?\s*(?:;|["'])|max-height\s*:\s*0)[^"']*["'][^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const parts: string[] = [];
  for (const m of html.matchAll(hidden)) parts.push(htmlToText(m[2] ?? ""));
  return parts.filter(Boolean).join("\n");
}
