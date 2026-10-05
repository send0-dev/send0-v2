// Lines that start the quoted part of a reply. Everything from the first match down is history.
const QUOTE_HEADERS: RegExp[] = [
  // Gmail / Apple Mail / Thunderbird: "On Mon, Oct 5, 2026 at 10:02 AM Dana <dana@acme.com> wrote:"
  /^\s*>?\s*On\b.{0,300}\bwrote:\s*$/im,
  // Same header wrapped over two lines by the client
  /^\s*On\b[^\n]{0,200}\n[^\n]{0,200}\bwrote:\s*$/im,
  /^\s*Le\b.{0,300}\ba écrit\s*:\s*$/im,
  /^\s*Am\b.{0,300}\bschrieb\b.{0,100}:\s*$/im,
  /^\s*El\b.{0,300}\bescribió\s*:\s*$/im,
  /^\s*Em\b.{0,300}\bescreveu\s*:\s*$/im,
  /^\s*Il giorno\b.{0,300}\bha scritto\s*:\s*$/im,
  // Outlook
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^\s*_{10,}\s*$\n^\s*From:\s/im,
  /^\s*From:\s.+\n\s*(?:Sent|Date):\s.+\n\s*To:\s/im,
  // Forwarded content is history too
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  /^\s*Begin forwarded message:\s*$/im,
];

const SIGNATURE_MARKERS: RegExp[] = [
  /^-- ?$/m, // RFC 3676 signature delimiter
  /^\s*Sent from my (?:iPhone|iPad|Android|mobile device|Galaxy|Pixel)\b.*$/im,
  /^\s*Sent from (?:Outlook|Mail|Yahoo Mail|Gmail)\b.*$/im,
  /^\s*Get Outlook for (?:iOS|Android)\b.*$/im,
];

function cutAtEarliest(text: string, patterns: RegExp[]): string {
  let cut = text.length;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

/**
 * The new text a person wrote, without quoted history, forwarded content or a trailing signature.
 * Falls back to the full text if stripping would leave nothing (e.g. a bare forward).
 */
export function extractReplyText(text: string | null | undefined): string {
  const body = (text ?? "").replace(/\r\n?/g, "\n");
  if (!body.trim()) return "";

  let reply = cutAtEarliest(body, QUOTE_HEADERS);
  // Drop trailing ">" quoted lines that weren't introduced by a header.
  const lines = reply.split("\n");
  while (lines.length && /^\s*(?:>.*)?$/.test(lines[lines.length - 1]!)) lines.pop();
  reply = lines.join("\n");
  reply = cutAtEarliest(reply, SIGNATURE_MARKERS);

  const result = reply.replace(/\n{3,}/g, "\n\n").trim();
  return result || body.trim();
}
