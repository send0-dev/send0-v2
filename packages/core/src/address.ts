export const RESERVED_LOCAL_PARTS = new Set([
  "postmaster",
  "abuse",
  "admin",
  "administrator",
  "hostmaster",
  "webmaster",
  "support",
  "noreply",
  "no-reply",
  "security",
  "billing",
  "mailer-daemon",
]);

export interface Recipient {
  /** Lowercased local part without the +tag, e.g. `bot` for `Bot+Task42@send0.email` */
  localPart: string;
  /** Plus-address tag, e.g. `task42`, or null */
  tag: string | null;
  domain: string;
  /** Canonical inbox address: `localPart@domain`, lowercased */
  address: string;
}

/** Splits an envelope recipient into inbox address and plus-tag. Returns null if it isn't an address. */
export function parseRecipient(raw: string): Recipient | null {
  const value = raw.trim().replace(/^<|>$/g, "").toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const plus = local.indexOf("+");
  const localPart = plus === -1 ? local : local.slice(0, plus);
  const tag = plus === -1 ? null : local.slice(plus + 1) || null;
  if (!localPart) return null;
  return { localPart, tag, domain, address: `${localPart}@${domain}` };
}

/** Local parts customers may claim: 1–64 chars of a-z, 0-9, dot, dash, underscore; no leading/trailing or doubled dots. */
export function isValidLocalPart(localPart: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) && !localPart.includes("..");
}

export function isReservedLocalPart(localPart: string): boolean {
  return RESERVED_LOCAL_PARTS.has(localPart.toLowerCase());
}
