import { isReservedLocalPart, parseRecipient, type Recipient } from "@send0/core";

export type RecipientCheck =
  | { ok: true; recipient: Recipient }
  | { ok: false; reason: "invalid" | "foreign_domain" | "reserved"; smtp: string };

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Cheap checks before touching the database: syntax, one of our domains, not a reserved name.
 * Runs while the SMTP session is open, so a refusal becomes a 5xx to the sending server.
 */
export function checkRecipient(to: string, env: { MAIL_DOMAINS: string }): RecipientCheck {
  const recipient = parseRecipient(to);
  if (!recipient) return { ok: false, reason: "invalid", smtp: "5.1.3 Bad recipient address syntax" };
  if (!list(env.MAIL_DOMAINS).includes(recipient.domain)) {
    return { ok: false, reason: "foreign_domain", smtp: "5.7.1 Relaying denied" };
  }
  if (isReservedLocalPart(recipient.localPart)) {
    return { ok: false, reason: "reserved", smtp: "5.1.1 Mailbox unavailable" };
  }
  return { ok: true, recipient };
}
