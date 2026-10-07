import { z } from "zod";

/**
 * Response shapes, mirroring the serializers. Strict objects: a test runs real requests and
 * parses every response with these, so a new or renamed field fails CI until the spec follows.
 */
export const registry = z.registry<{ id: string; description?: string }>();
const reg = <T extends z.ZodType>(id: string, schema: T, description?: string) => (registry.add(schema, { id, description }), schema);

const ts = z.iso.datetime({ offset: true });
const nts = ts.nullable();

export const Mailbox = reg("Mailbox", z.strictObject({ name: z.string().nullable(), email: z.string() }));

export const ErrorBody = reg(
  "Error",
  z.strictObject({
    error: z.strictObject({
      code: z.string().describe("Stable, machine-readable code, e.g. not_found, recipient_not_allowed"),
      message: z.string(),
      param: z.string().optional().describe("The request field the error is about"),
      request_id: z.string().optional(),
    }),
  }),
);

export const Attachment = reg(
  "Attachment",
  z.strictObject({
    id: z.string(),
    filename: z.string().nullable(),
    content_type: z.string(),
    size: z.number().int(),
    inline: z.boolean(),
    content_id: z.string().nullable(),
  }),
);

export const AttachmentDownload = reg(
  "AttachmentDownload",
  Attachment.extend({
    object: z.literal("attachment"),
    message_id: z.string(),
    download_url: z.string().describe("Pre-signed URL, valid until expires_at"),
    expires_at: ts,
  }),
);

export const Message = reg(
  "Message",
  z.strictObject({
    object: z.literal("message"),
    id: z.string(),
    inbox_id: z.string(),
    thread_id: z.string(),
    direction: z.enum(["in", "out"]),
    status: z.enum(["received", "queued", "sent", "delivered", "bounced", "complained", "failed"]),
    rfc_message_id: z.string().nullable(),
    in_reply_to: z.array(z.string()),
    references: z.array(z.string()),
    from: Mailbox.nullable(),
    to: z.array(Mailbox),
    cc: z.array(Mailbox),
    reply_to: z.array(Mailbox),
    subject: z.string(),
    text: z.string().nullable(),
    html: z.string().nullable().optional().describe("Only on single-message reads and threads with include_html=true"),
    extracted_text: z.string().nullable().describe("New text only: quoted history, forwards and signatures removed"),
    extracted: z
      .strictObject({
        otp: z.string().nullable().describe("Most likely one-time code"),
        links: z.array(z.string()),
        action_link: z.string().nullable().describe("Most likely verify / sign-in / reset link"),
      })
      .nullable(),
    auth: z.strictObject({ spf: z.string(), dkim: z.string(), dmarc: z.string() }).nullable(),
    safety: z.strictObject({ prompt_injection: z.enum(["none", "suspected", "likely"]), reasons: z.array(z.string()) }).nullable(),
    tag: z.string().nullable().describe("Plus-address tag, e.g. task42 for bot+task42@"),
    attachments: z.array(Attachment),
    size: z.number().int(),
    sent_at: nts,
    received_at: nts,
    created_at: ts,
  }),
);

export const Thread = reg(
  "Thread",
  z.strictObject({
    object: z.literal("thread"),
    id: z.string(),
    inbox_id: z.string(),
    subject: z.string(),
    participants: z.array(z.string()),
    message_count: z.number().int(),
    labels: z.array(z.string()),
    latest_message: z
      .strictObject({
        id: z.string(),
        direction: z.enum(["in", "out"]),
        from: Mailbox.nullable(),
        snippet: z.string().describe("Start of the new text (quotes and signatures removed), whitespace collapsed"),
      })
      .nullable()
      .describe("The newest message, for list previews"),
    last_message_at: ts,
    created_at: ts,
  }),
);
export const ThreadWithMessages = reg("ThreadWithMessages", Thread.extend({ messages: z.array(Message) }));

export const Inbox = reg(
  "Inbox",
  z.strictObject({
    object: z.literal("inbox"),
    id: z.string(),
    address: z.string(),
    local_part: z.string(),
    domain: z.string(),
    display_name: z.string().nullable(),
    mode: z.enum(["live", "sandbox"]),
    send_policy: z.enum(["open", "reply_only", "approval"]),
    status: z.enum(["active", "suspended", "deleted"]),
    retention_days: z.number().int(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    expires_at: nts,
    created_at: ts,
    updated_at: ts,
  }),
);
export const DeletedInbox = reg("DeletedInbox", Inbox.extend({ deleted: z.literal(true) }));

export const ApiKey = reg(
  "ApiKey",
  z.strictObject({
    object: z.literal("api_key"),
    id: z.string(),
    name: z.string(),
    prefix: z.string(),
    mode: z.enum(["live", "test"]),
    scopes: z.array(z.string()),
    inbox_ids: z.array(z.string()).nullable(),
    last_used_at: nts,
    created_at: ts,
  }),
);
export const ApiKeyWithSecret = reg("ApiKeyWithSecret", ApiKey.extend({ key: z.string().describe("Shown once") }));
export const RevokedApiKey = reg("RevokedApiKey", ApiKey.extend({ revoked: z.literal(true) }));

export const Webhook = reg(
  "Webhook",
  z.strictObject({
    object: z.literal("webhook"),
    id: z.string(),
    url: z.string(),
    events: z.array(z.string()),
    inbox_ids: z.array(z.string()).nullable(),
    status: z.enum(["enabled", "disabled"]),
    created_at: ts,
  }),
);
export const WebhookWithSecret = reg("WebhookWithSecret", Webhook.extend({ secret: z.string().describe("Signing secret, shown once") }));
export const DeletedWebhook = reg("DeletedWebhook", Webhook.extend({ deleted: z.literal(true) }));
export const WebhookTestResult = reg(
  "WebhookTestResult",
  z.strictObject({ object: z.literal("event"), id: z.string(), type: z.literal("webhook.test"), delivery_id: z.string() }),
);

export const Delivery = reg(
  "Delivery",
  z.strictObject({
    object: z.literal("delivery"),
    id: z.string(),
    webhook_id: z.string(),
    event_id: z.string(),
    event_type: z.string().nullable(),
    status: z.enum(["pending", "succeeded", "failed"]),
    attempts: z.number().int(),
    last_status_code: z.number().int().nullable(),
    last_error: z.string().nullable(),
    last_duration_ms: z.number().int().nullable(),
    next_attempt_at: nts,
    created_at: ts,
    updated_at: ts,
  }),
);

export const Draft = reg(
  "Draft",
  z.strictObject({
    object: z.literal("draft"),
    id: z.string(),
    inbox_id: z.string(),
    thread_id: z.string().nullable(),
    status: z.enum(["pending", "approved", "rejected", "sent"]),
    kind: z.enum(["new", "reply", "forward"]),
    to: z.array(Mailbox),
    cc: z.array(Mailbox),
    bcc: z.array(Mailbox),
    subject: z.string(),
    text: z.string().nullable(),
    html: z.string().nullable(),
    decided_by: z.string().nullable(),
    decided_at: nts,
    created_at: ts,
  }),
);

export const WaitResult = reg(
  "WaitResult",
  z.strictObject({
    object: z.literal("wait_result"),
    timed_out: z.boolean(),
    message: Message.nullable().describe("The first matching message, or null on timeout"),
  }),
);

export const Event = reg(
  "Event",
  z.strictObject({
    id: z.string(),
    object: z.literal("event"),
    type: z
      .string()
      .describe(
        "message.received, message.sent, message.delivered, message.bounced, message.complained, draft.created, inbox.suspended, webhook.test",
      ),
    created_at: ts,
    inbox_id: z.string().nullable(),
    data: z
      .record(z.string(), z.unknown())
      .describe(
        'The payload. message.*: the message (without html). inbox.suspended: { scope: "org" | "inbox", reason, … }; "org" means sending is paused account-wide, "inbox" that one inbox is suspended.',
      ),
  }),
  "Envelope for webhooks and the SSE stream",
);

export const Usage = reg(
  "Usage",
  z.strictObject({
    object: z.literal("usage"),
    plan: z.enum(["free", "pro", "scale"]),
    inboxes: z.strictObject({
      used: z.number().int(),
      limit: z.number().int().nullable().describe("null when the install has no inbox cap (self-hosted)"),
    }),
    sends_today: z.strictObject({
      used: z.number().int(),
      limit: z.number().int().nullable().describe("null when the install has no daily cap (self-hosted)"),
      resets_at: ts.describe("Midnight UTC, when the daily count starts over"),
    }),
    sending: z.strictObject({
      paused: z.boolean(),
      reason: z.string().nullable(),
      paused_at: nts,
    }),
  }),
);

const DayCounts = z.strictObject({
  received: z.number().int(),
  sent: z.number().int(),
  delivered: z.number().int(),
  bounced: z.number().int().describe("Bounces and complaints"),
  failed: z.number().int(),
});

export const Stats = reg(
  "Stats",
  z.strictObject({
    object: z.literal("stats"),
    from: ts.describe("Start of the first day (UTC)"),
    days: z.array(DayCounts.extend({ date: z.string().describe("YYYY-MM-DD, UTC") })),
    totals: DayCounts,
  }),
);

/** Paginated list of T. */
export const list = <T extends z.ZodType>(id: string, item: T) =>
  reg(id, z.strictObject({ object: z.literal("list"), data: z.array(item), next_cursor: z.string().nullable() }));

export const InboxList = list("InboxList", Inbox);
export const MessageList = list("MessageList", Message);
export const ThreadList = list("ThreadList", Thread);
export const ApiKeyList = list("ApiKeyList", ApiKey);
export const WebhookList = list("WebhookList", Webhook);
export const DeliveryList = list("DeliveryList", Delivery);
export const DraftList = list("DraftList", Draft);
