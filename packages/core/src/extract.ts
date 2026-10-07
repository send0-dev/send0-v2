import { htmlLinks } from "./html";

export interface Extracted {
  /** Most likely one-time code, digits/letters only, e.g. "482913". Null when nothing convincing. */
  otp: string | null;
  /** http(s) links, action links (verify, confirm, magic sign-in, reset) first, unsubscribe and tracking links dropped. */
  links: string[];
  /** The single link an agent most likely needs to open, or null. */
  actionLink: string | null;
}

const OTP_KEYWORDS =
  /\b(?:code|otp|one[- ]?time|passcode|pass code|pin|verification|verify|security code|login code|sign[- ]?in code|2fa|two[- ]factor|mfa|confirm(?:ation)?|token)\b|验证码|認証コード|código|kode/i;

interface Candidate {
  value: string;
  score: number;
  index: number;
}

/** Plain digits, or digits split into groups like "482 913" / "482-913". */
const NUMERIC = /(?<![\w$€£#.,:/-])(\d{3,4}[ -]\d{3,4}|\d{4,8})(?![\w%/-]|[.,:]\d)/g;
/** Mixed letters and digits, uppercase, 6–8 chars, e.g. "K7Q2MZ". */
const ALNUM = /(?<![\w-])(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])([A-Z0-9]{6,8})(?![\w-])/g;

function scoreCandidate(text: string, index: number, raw: string, subjectHasKeyword: boolean): number {
  const value = raw.replace(/[ -]/g, "");
  let score = 0;

  // URLs are stripped from the context: "?token=" in a link says nothing about a nearby number.
  const noUrls = (s: string) => s.replace(/https?:\/\/\S+/gi, " ");
  const before = noUrls(text.slice(Math.max(0, index - 90), index));
  const after = noUrls(text.slice(index + raw.length, index + raw.length + 50));
  if (OTP_KEYWORDS.test(before)) score += 4;
  else if (OTP_KEYWORDS.test(after)) score += 3;
  // "code: 4821", "code is 4821", "Enter 99887766", "Use 123456"
  if (/(?:code|otp|pin|passcode)\W{0,3}(?:is\W{0,3})?$/i.test(before)) score += 2;
  if (/\b(?:enter|use|type|input)\s*$/i.test(before)) score += 1.5;
  if (subjectHasKeyword) score += 1;

  // Code sitting on its own line is a strong signal.
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const lineEndIdx = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEndIdx === -1 ? undefined : lineEndIdx).trim();
  if (line === raw.trim()) score += 3;

  if (value.length === 6) score += 2;
  else if (value.length === 4 || value.length === 8) score += 0.5;

  // Things that look like codes but aren't.
  if (/^(?:19|20)\d{2}$/.test(value)) score -= 4; // years
  if (/(?:order|invoice|ticket|case|ref(?:erence)?|account|acct|id|no\.?|number|#|zip|postal)\s*(?::|is|was)?\s*$/i.test(before))
    score -= 5;
  if (/^\s*(?:am|pm|usd|eur|inr|gb|mb|kb|px|ms|%|°)/i.test(after)) score -= 4;
  if (/(?:\+|tel:?|phone:?|call)\s*[\d\s()-]*$/i.test(before)) score -= 5;
  if (/^0+$/.test(value) || /^(\d)\1+$/.test(value)) score -= 3;
  // Discount codes are codes, just not the kind an agent needs to sign in.
  if (
    /\b(?:promo|coupon|discount|voucher|gift|referral|sale)\b[^\n]{0,30}$/i.test(before) ||
    /^[^\n]{0,25}\b(?:off|discount)\b/i.test(after)
  )
    score -= 6;

  return score;
}

export function extractOtp(text: string, subject = ""): string | null {
  const body = text.replace(/\r\n?/g, "\n");
  const subjectHasKeyword = OTP_KEYWORDS.test(subject);
  if (!subjectHasKeyword && !OTP_KEYWORDS.test(body)) return null;

  const candidates: Candidate[] = [];
  for (const m of body.matchAll(NUMERIC)) {
    candidates.push({
      value: m[1]!.replace(/[ -]/g, ""),
      index: m.index!,
      score: scoreCandidate(body, m.index!, m[1]!, subjectHasKeyword),
    });
  }
  for (const m of body.matchAll(ALNUM)) {
    candidates.push({ value: m[1]!, index: m.index!, score: scoreCandidate(body, m.index!, m[1]!, subjectHasKeyword) - 1 });
  }
  // Codes often appear in the subject too: "123456 is your Acme code".
  for (const m of subject.matchAll(NUMERIC)) {
    candidates.push({ value: m[1]!.replace(/[ -]/g, ""), index: -1, score: scoreCandidate(subject, m.index!, m[1]!, true) + 1 });
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = candidates[0];
  return best && best.score >= 5 ? best.value : null;
}

const ACTION =
  /verif|confirm|activat|magic|log-?in|sign-?in|signin|auth|token|reset|password|invite|accept|approve|validate|one-?time|otp/i;
const DROP = /unsubscribe|optout|opt-out|email-preferences|manage[-_]?preferences|\/track\/|\/open\?|pixel|beacon/i;
const DROP_HOSTS = /(?:^|\.)(?:list-manage\.com|sendgrid\.net\/wf\/open|mandrillapp\.com\/track)/i;

function cleanUrl(u: string): string | null {
  const trimmed = u.trim().replace(/[)\]>.,;:!?'"]+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractLinks(text: string, html?: string | null): { links: string[]; actionLink: string | null } {
  const raw = [...(html ? htmlLinks(html) : []), ...(text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [])];
  const seen = new Set<string>();
  const action: string[] = [];
  const other: string[] = [];
  for (const r of raw) {
    const url = cleanUrl(r);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (DROP.test(url) || DROP_HOSTS.test(url)) continue;
    (ACTION.test(url) ? action : other).push(url);
  }
  return { links: [...action, ...other], actionLink: action[0] ?? null };
}

export function extract(text: string, html: string | null | undefined, subject: string): Extracted {
  const { links, actionLink } = extractLinks(text, html);
  return { otp: extractOtp(text, subject), links, actionLink };
}
