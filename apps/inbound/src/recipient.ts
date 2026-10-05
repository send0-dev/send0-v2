import { isReservedLocalPart, parseRecipient, type Recipient } from "@send0/core";

export type RecipientCheck =
  | { ok: true; recipient: Recipient }
  | { ok: false; reason: "invalid" | "foreign_domain" | "reserved" | "unknown"; smtp: string };

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Decides whether we accept mail for an envelope recipient. Runs while the SMTP session is open,
 * so a refusal becomes a 5xx to the sending server instead of a bounce we'd have to send later.
 * Milestone 1: inboxes come from ALLOWED_INBOXES; later this becomes a database lookup.
 */
export function checkRecipient(to: string, env: { MAIL_DOMAINS: string; ALLOWED_INBOXES: string }): RecipientCheck {
  const recipient = parseRecipient(to);
  if (!recipient) return { ok: false, reason: "invalid", smtp: "5.1.3 Bad recipient address syntax" };
  if (!list(env.MAIL_DOMAINS).includes(recipient.domain)) {
    return { ok: false, reason: "foreign_domain", smtp: "5.7.1 Relaying denied" };
  }
  if (isReservedLocalPart(recipient.localPart)) {
    return { ok: false, reason: "reserved", smtp: "5.1.1 Mailbox unavailable" };
  }
  if (!list(env.ALLOWED_INBOXES).includes(recipient.localPart)) {
    return { ok: false, reason: "unknown", smtp: "5.1.1 Mailbox does not exist" };
  }
  return { ok: true, recipient };
}
