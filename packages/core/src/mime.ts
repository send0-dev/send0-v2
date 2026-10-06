export interface MimeAddress {
  name?: string | null;
  email: string;
}

export interface OutgoingMessage {
  from: MimeAddress;
  to: MimeAddress[];
  cc?: MimeAddress[];
  replyTo?: MimeAddress[];
  subject: string;
  text?: string | null;
  html?: string | null;
  /** Full Message-ID with angle brackets, e.g. <msg_…@send0.email> */
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  date?: Date;
  /** Extra headers, e.g. X-Send0-Inbox. Never From/To/Subject/etc. */
  headers?: Record<string, string>;
}

const CRLF = "\r\n";
const enc = new TextEncoder();

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** RFC 2047 encoded-word (UTF-8, base64), split so each word stays under 75 chars. */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (enc.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w))}?=`).join(`${CRLF} `);
}

export function formatAddress(a: MimeAddress): string {
  if (!a.name) return a.email;
  const name = isAscii(a.name) ? `"${a.name.replace(/(["\\])/g, "\\$1")}"` : encodeHeaderValue(a.name);
  return `${name} <${a.email}>`;
}

/** Folds a long structured header (address lists, References) at commas/spaces. */
function fold(name: string, items: string[], sep: string): string {
  const lines: string[] = [];
  let line = `${name}: `;
  items.forEach((item, i) => {
    const piece = item + (i < items.length - 1 ? sep : "");
    if (line.length + piece.length > 76 && line.trim() !== `${name}:`) {
      lines.push(line.trimEnd());
      line = " ";
    }
    line += piece;
  });
  lines.push(line);
  return lines.join(CRLF);
}

/** Body part as base64, wrapped at 76 chars: safe for any UTF-8 and any line length. */
function part(contentType: string, body: string): string {
  const b64 = base64(enc.encode(body)).replace(/.{76}/g, `$&${CRLF}`);
  return `Content-Type: ${contentType}; charset=utf-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${b64}`;
}

/** RFC 5322 date in UTC: "Mon, 05 Oct 2026 10:14:03 +0000" */
export function rfc5322Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

const FORBIDDEN_EXTRA = /^(from|to|cc|bcc|subject|date|message-id|in-reply-to|references|mime-version|content-type|content-transfer-encoding|reply-to|sender|return-path)$/i;

/**
 * Builds a complete RFC 5322 message. Bcc is never written to headers: pass it to the
 * transport as envelope recipients only.
 */
export function buildMime(m: OutgoingMessage): string {
  if (!m.text && !m.html) throw new Error("A message needs text, html or both.");
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ");
  const headers: string[] = [
    `From: ${formatAddress(m.from)}`,
    fold("To", m.to.map(formatAddress), ", "),
    ...(m.cc?.length ? [fold("Cc", m.cc.map(formatAddress), ", ")] : []),
    ...(m.replyTo?.length ? [fold("Reply-To", m.replyTo.map(formatAddress), ", ")] : []),
    `Subject: ${encodeHeaderValue(clean(m.subject))}`,
    `Date: ${rfc5322Date(m.date ?? new Date())}`,
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []),
    ...(m.references?.length ? [fold("References", m.references, " ")] : []),
    "MIME-Version: 1.0",
  ];
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    if (FORBIDDEN_EXTRA.test(k) || !/^[A-Za-z0-9-]+$/.test(k)) throw new Error(`Header ${k} can't be set here.`);
    headers.push(`${k}: ${encodeHeaderValue(clean(v))}`);
  }

  let body: string;
  if (m.text && m.html) {
    const boundary = `=_send0_${base64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, "")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [`--${boundary}`, part("text/plain", m.text), `--${boundary}`, part("text/html", m.html), `--${boundary}--`, ""].join(CRLF);
  } else {
    const [type, content] = m.html ? ["text/html", m.html] : ["text/plain", m.text!];
    const p = part(type, content);
    const split = p.indexOf(CRLF + CRLF);
    headers.push(...p.slice(0, split).split(CRLF));
    body = p.slice(split + 4);
  }
  return headers.join(CRLF) + CRLF + CRLF + body + CRLF;
}

/** "Re: " unless the subject already is a reply. */
export function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

/** "Fwd: " unless already forwarded. */
export function forwardSubject(subject: string): string {
  return /^\s*(fwd?|fw)\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;
}

/** References for a reply: the parent's references plus the parent itself, newest last, capped. */
export function replyReferences(parentReferences: string[], parentMessageId: string | null): string[] {
  const refs = [...parentReferences, ...(parentMessageId ? [parentMessageId] : [])];
  const unique = [...new Set(refs)];
  // Keep the root and the most recent ids; mail clients only need those to thread.
  return unique.length > 20 ? [unique[0]!, ...unique.slice(-19)] : unique;
}
