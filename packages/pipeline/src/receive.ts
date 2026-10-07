import type { BlobStore } from "@send0/adapters/blob";
import { isReservedLocalPart, newId, parseInbound, parseRecipient, type ParsedMessage, type Recipient } from "@send0/core";
import type { Db } from "@send0/db";
import { publish, type EventEnvelope, type HubNamespaceLike, type QueueLike } from "./events";
import { findInboxByAddress } from "./inbox-lookup";
import { ingestMessage, type IngestResult } from "./ingest";

/** The largest message we accept (Cloudflare Email Routing's limit; the SMTP listener uses the same). */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

/** Reserved names whose mail goes to the operator, when the runtime can forward (RFC 5321 requires postmaster). */
export const OPERATOR_LOCAL_PARTS = ["postmaster", "abuse"];

/** What inbound handling needs from config: our domains and the MX whose auth results we trust. */
export interface InboundConfig {
  mailDomains: string[];
  trustedAuthservIds: string[];
  /** Reserved local parts handed to `forwardReserved` instead of refused (default OPERATOR_LOCAL_PARTS) */
  operatorLocalParts?: string[];
}

export interface InboundDeps {
  db: Db;
  blobs: BlobStore;
  /** Real-time hubs and the webhook queue; events still reach webhooks via the outbox sweep if these fail */
  hub?: HubNamespaceLike;
  queue?: QueueLike;
  /** Replaces the hub and queue publish, e.g. the self-hosted server's PgHub + pg-boss. Must not throw. */
  publish?: (orgId: string, envelope: EventEnvelope) => Promise<void>;
  /**
   * Hands mail for an operator address (postmaster@, abuse@ on our domains) to the operator. Without it
   * that mail is refused like any other reserved name. A throw propagates, so the sender retries.
   */
  forwardReserved?: (message: InboundMessage, localPart: string) => Promise<void>;
}

/** The parts of ForwardableEmailMessage we use, so tests can pass a plain object. */
export interface InboundMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
  /** Email Routing's forward to a verified destination address; other runtimes leave it out. */
  forward?(to: string): Promise<unknown>;
}

export type RecipientCheck =
  { ok: true; recipient: Recipient } | { ok: false; reason: "invalid" | "foreign_domain" | "reserved"; smtp: string };

/**
 * Cheap checks before touching the database: syntax, one of our domains, not a reserved name.
 * Runs while the SMTP session is open, so a refusal becomes a 5xx to the sending server.
 */
export function checkRecipient(to: string, mailDomains: string[]): RecipientCheck {
  const recipient = parseRecipient(to);
  if (!recipient) return { ok: false, reason: "invalid", smtp: "5.1.3 Bad recipient address syntax" };
  if (!mailDomains.includes(recipient.domain)) return { ok: false, reason: "foreign_domain", smtp: "5.7.1 Relaying denied" };
  if (isReservedLocalPart(recipient.localPart)) return { ok: false, reason: "reserved", smtp: "5.1.1 Mailbox unavailable" };
  return { ok: true, recipient };
}

/** The operator local part `to` is addressed to (plus-tags ignored), or null when it isn't one on our domains. */
export function operatorLocalPart(to: string, cfg: Pick<InboundConfig, "mailDomains" | "operatorLocalParts">): string | null {
  const r = parseRecipient(to);
  if (!r || !cfg.mailDomains.includes(r.domain) || !isReservedLocalPart(r.localPart)) return null;
  return (cfg.operatorLocalParts ?? OPERATOR_LOCAL_PARTS).includes(r.localPart) ? r.localPart : null;
}

/**
 * Why an OPERATOR_FORWARD_TO value can't be used, or null when it can. A reserved name on one of our own
 * domains is refused: forwarding postmaster@ to postmaster@ would loop.
 */
export function operatorAddressProblem(address: string, mailDomains: string[]): string | null {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return "must be an email address, like you@acme.com";
  const check = checkRecipient(address, mailDomains);
  if (!check.ok && check.reason === "reserved") return "must not be a reserved address on your own mail domains (mail to it would loop)";
  return null;
}

/** A `forwardReserved` hook for Cloudflare Email Routing: `message.forward(to)`, to a verified destination address. */
export function emailRoutingForwarder(to: string | undefined): InboundDeps["forwardReserved"] {
  const address = to?.trim();
  if (!address) return undefined;
  return async (message) => {
    if (!message.forward) throw new Error("This runtime can't forward mail");
    await message.forward(address);
  };
}

export function rawKey(orgId: string, id: string, at: Date): string {
  const d = at.toISOString();
  return `raw/${orgId}/${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}/${id}.eml`;
}

const reject = (message: InboundMessage, reason: string, smtp: string, extra: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ event: "message.rejected", reason, to: message.to, from: message.from, ...extra }));
  message.setReject(smtp);
};

/** Log line for an accepted message. Bodies are truncated: logs are for debugging, not storage. */
function summarize(key: string, m: ParsedMessage, r: IngestResult) {
  return {
    event: r.duplicate ? "message.duplicate" : "message.received",
    id: r.messageId,
    ...(r.duplicate ? {} : { thread_id: r.threadId, thread_matched_by: r.threadMatchedBy, event_id: r.event.id }),
    raw_key: key,
    from: m.from?.email,
    subject: m.subject,
    extracted_text: m.extractedText.slice(0, 200),
    otp: m.extracted.otp,
    auth: m.auth,
    prompt_injection: m.safety.promptInjection,
    attachments: m.attachments.length,
    size: m.size,
  };
}

/**
 * Accept or refuse one inbound message, then store it.
 * Order matters: refuse early (SMTP 5xx), write the raw .eml before anything else,
 * then parse and ingest. A database failure throws, so the sender retries; ingestion is idempotent.
 * Mail for an operator address (postmaster@, abuse@) goes to `deps.forwardReserved` when it's set, and is
 * neither stored nor ingested.
 */
export async function receiveMessage(
  message: InboundMessage,
  cfg: InboundConfig,
  deps: InboundDeps,
  now = new Date(),
): Promise<IngestResult | null> {
  const tooLarge = message.rawSize > MAX_MESSAGE_BYTES;
  const check = checkRecipient(message.to, cfg.mailDomains);
  if (!check.ok) {
    const operator = check.reason === "reserved" && deps.forwardReserved ? operatorLocalPart(message.to, cfg) : null;
    if (!operator) return (reject(message, check.reason, check.smtp), null);
    if (tooLarge) return (reject(message, "too_large", "5.3.4 Message too big", { size: message.rawSize }), null);
    await deps.forwardReserved!(message, operator);
    console.log(JSON.stringify({ event: "message.forwarded_to_operator", to: message.to, from: message.from }));
    return null;
  }
  if (tooLarge) return (reject(message, "too_large", "5.3.4 Message too big", { size: message.rawSize }), null);

  const { recipient } = check;
  const inbox = await findInboxByAddress(deps.db, recipient.localPart, recipient.domain);
  if (!inbox) return (reject(message, "unknown", "5.1.1 Mailbox does not exist"), null);
  if (inbox.status !== "active") return (reject(message, "suspended", "5.2.1 Mailbox disabled", { inbox_id: inbox.id }), null);

  const id = newId("msg");
  const key = rawKey(inbox.orgId, id, now);
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());

  await deps.blobs.put(key, raw, {
    contentType: "message/rfc822",
    metadata: { id, inbox_id: inbox.id, tag: recipient.tag ?? "", envelope_from: message.from, received_at: now.toISOString() },
  });

  let parsed: ParsedMessage;
  try {
    parsed = await parseInbound(raw, {
      trustedAuthservIds: cfg.trustedAuthservIds,
    });
  } catch (err) {
    // Accepted and stored; a parser bug must never bounce mail. It can be re-ingested from raw_key.
    console.error(JSON.stringify({ event: "message.parse_failed", id, inbox_id: inbox.id, raw_key: key, error: String(err) }));
    return null;
  }

  const result = await ingestMessage(deps.db, deps.blobs, {
    inbox,
    messageId: id,
    rawKey: key,
    parsed,
    tag: recipient.tag,
    receivedAt: now,
  });
  console.log(JSON.stringify({ ...summarize(key, parsed, result), inbox_id: inbox.id }));
  if (!result.duplicate) {
    if (deps.publish) await deps.publish(inbox.orgId, result.envelope);
    else await publish({ hub: deps.hub, queue: deps.queue }, inbox.orgId, result.envelope);
  }
  return result;
}
