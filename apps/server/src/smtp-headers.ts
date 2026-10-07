import type { AuthenticateResult } from "mailauth";

/** SPF/DKIM/DMARC (and ARC) verdicts as bare result tokens, ready for our Authentication-Results. */
export interface Verdicts {
  spf: string;
  dkim: string;
  dmarc: string;
  arc?: string;
}

/** A message split into raw header fields (folding and line endings kept) and the rest: blank line plus body. */
export interface SplitMessage {
  fields: string[];
  body: Uint8Array;
}

/** Where the header ends: just past the line ending before the first blank line (CRLF or bare LF). */
function headerEnd(raw: Uint8Array): number {
  for (let i = 0; i < raw.length - 1; i++) {
    if (raw[i] !== 10) continue;
    if (raw[i + 1] === 10) return i + 1;
    if (raw[i + 1] === 13 && raw[i + 2] === 10) return i + 1;
  }
  return raw.length;
}

/** Bytes to a string one char per byte (latin1), so encoding back is byte-exact even for raw 8-bit headers. */
function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

/** Splits at the first blank line into header fields and the rest. */
export function splitMessage(raw: Uint8Array): SplitMessage {
  const end = headerEnd(raw);
  return {
    fields: latin1(raw.subarray(0, end))
      .split(/(?<=\n)(?=[^ \t])/)
      .filter(Boolean),
    body: raw.subarray(end),
  };
}

/** Joins `prefix`, header fields (latin1, as split) and the body into one buffer, copying the body once. */
export function joinMessage(prefix: string, fields: string[], body: Uint8Array): Uint8Array {
  const head = prefix + fields.join("");
  const out = new Uint8Array(head.length + body.length);
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i) & 0xff;
  out.set(body, head.length);
  return out;
}

const isField = (name: string) => (f: string) => new RegExp(`^${name}[ \\t]*:`, "i").test(f);
export const isDkimSignature = isField("dkim-signature");
export const isArcField = isField("arc-[a-z-]+");

/** ARC sets on a message: one ARC-Seal, ARC-Message-Signature and ARC-Authentication-Results each. */
export function arcSetCount(fields: string[]): number {
  return Math.max(...["arc-seal", "arc-message-signature", "arc-authentication-results"].map((n) => fields.filter(isField(n)).length));
}

/**
 * Whether a field is an Authentication-Results or ARC-Authentication-Results claiming `hostname`
 * (or a subdomain of it) as its authserv-id. Only we may write those; anything arriving with the
 * message is forged and gets stripped.
 */
export function claimsAuthservId(field: string, hostname: string): boolean {
  const m = /^(arc-)?authentication-results[ \t]*:([\s\S]*)$/i.exec(field);
  if (!m) return false;
  let value = m[2]!.replace(/\r?\n[ \t]+/g, " ");
  if (m[1]) value = value.replace(/^\s*i\s*=\s*\d+\s*;/i, "");
  value = value.replace(/\([^)]*\)/g, " ");
  const id = value.trim().split(/[\s;]/)[0]!.replace(/^"|"$/g, "").toLowerCase();
  const host = hostname.toLowerCase();
  return id === host || id.endsWith(`.${host}`);
}

/** A result token, or permerror for anything unexpected: never sender-influenced text. */
function token(result: unknown): string {
  const r = typeof result === "string" ? result.toLowerCase() : "none";
  if (r === "temperr") return "temperror";
  return /^[a-z]+$/.test(r) ? r : "permerror";
}

/** Verdicts from mailauth's structured results; checks we skipped for amplification are permerror. */
export function verdictsFrom(result: AuthenticateResult, skipped: { dkim: boolean; arc: boolean }): Verdicts {
  const dkimResults = (result.dkim.results ?? []).map((r) => token(r.status.result));
  const dkim = skipped.dkim ? "permerror" : dkimResults.includes("pass") ? "pass" : (dkimResults[0] ?? "none");
  const arc = skipped.arc ? "permerror" : result.arc ? token(result.arc.status.result) : undefined;
  return {
    spf: result.spf ? token(result.spf.status.result) : "none",
    dkim,
    dmarc: result.dmarc ? token(result.dmarc.status.result) : "none",
    ...(arc ? { arc } : {}),
  };
}

/** Our Authentication-Results: only our hostname and result tokens, no sender-controlled properties. */
export function authResultsHeader(hostname: string, v: Verdicts): string {
  return `Authentication-Results: ${hostname}; spf=${v.spf}; dkim=${v.dkim}; dmarc=${v.dmarc}${v.arc ? `; arc=${v.arc}` : ""}\r\n`;
}

/** The HELO name made safe for a comment: printable ASCII without comment or result syntax. */
function sanitizeHelo(helo: string): string {
  return helo.replace(/[^\x21-\x7e]|[;()"\\]/g, "").slice(0, 255);
}

/** The RFC 5321 section 4.4 trace line. The client's HELO appears only as a sanitised comment. */
export function receivedHeader(hostname: string, client: { ip: string; helo: string; secure: boolean }, at: Date): string {
  const ip = client.ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  const literal = ip.includes(":") ? `[IPv6:${ip}]` : `[${ip}]`;
  const helo = sanitizeHelo(client.helo);
  const date = at.toUTCString().replace(/GMT$/, "+0000");
  return `Received: from ${literal}${helo ? ` (helo=${helo})` : ""} by ${hostname} with ${client.secure ? "ESMTPS" : "ESMTP"}; ${date}\r\n`;
}
