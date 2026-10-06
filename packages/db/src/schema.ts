import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Column names are snake_case in the database (Drizzle `casing: "snake_case"`).

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export interface MailboxJson {
  name: string | null;
  email: string;
}

// ---------- Tenancy and access ----------

export const orgs = pgTable("orgs", {
  id: text().primaryKey(), // org_…
  name: text().notNull(),
  plan: text({ enum: ["free", "pro", "scale"] })
    .notNull()
    .default("free"),
  status: text({ enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  /** Outbound messages allowed per UTC day. New orgs start low; raised as reputation builds. */
  dailySendLimit: integer().notNull().default(50),
  /** Set when sending is paused (complaint/bounce thresholds or by hand). Receiving keeps working. */
  sendingPausedAt: timestamp({ withTimezone: true }),
  sendingPausedReason: text(),
  /** Soft-deleted by its owner. Keys, webhooks and inboxes are shut off at once; data is purged after 30 days. */
  deletedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: text().primaryKey(), // usr_…
    email: text().notNull(),
    name: text(),
    /** pbkdf2-sha256$<iterations>$<salt b64>$<hash b64> */
    passwordHash: text().notNull(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** Onboarding finished (org named, first inbox, key shown) */
    onboardedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)]
);

export const members = pgTable(
  "members",
  {
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: ["owner", "admin", "member"] })
      .notNull()
      .default("owner"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("members_user_idx").on(t.userId),
    // Exactly one owner per workspace (transfers demote before they promote).
    uniqueIndex("members_one_owner_idx").on(t.orgId).where(sql`${t.role} = 'owner'`),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(), // ses_…
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie value; the cookie itself is never stored */
    tokenHash: text().notNull(),
    /** The workspace this session is looking at. Falls back to the user's oldest membership when null. */
    orgId: text().references(() => orgs.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ]
);

/** Single-use, expiring tokens for email verification and password reset. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text({ enum: ["verify_email", "reset_password"] }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.purpose)]
);

/** Invitations to join a workspace. Only the hash of the emailed token is stored. */
export const invites = pgTable(
  "invites",
  {
    id: text().primaryKey(), // inv_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text({ enum: ["admin", "member"] }).notNull(),
    tokenHash: text().notNull(),
    invitedBy: text().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invites_token_idx").on(t.tokenHash),
    // At most one open invite per address per workspace.
    uniqueIndex("invites_open_idx")
      .on(t.orgId, sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ]
);

/** Fixed-window counters for login, sign-up and email rate limits. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().primaryKey(), // e.g. "login:ip:1.2.3.4:2026-10-06T10:15"
    count: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires_idx").on(t.expiresAt)]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text().primaryKey(), // key_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** First characters of the key, shown in the dashboard: "s0_live_AbCd" */
    prefix: text().notNull(),
    /** SHA-256 of the full key, hex. The key itself is never stored. */
    hash: text().notNull(),
    mode: text({ enum: ["live", "test"] }).notNull(),
    scopes: text().array().notNull(), // read | send | admin
    /** null = every inbox in the org */
    inboxIds: text().array(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.hash),
    index("api_keys_org_idx").on(t.orgId),
  ]
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    key: text().notNull(),
    /** "POST /v1/inboxes" */
    route: text().notNull(),
    /** SHA-256 of the request body, to catch the same key reused with a different request */
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.key] }),
    index("idempotency_created_idx").on(t.createdAt),
  ]
);

// ---------- Addresses ----------

export const domains = pgTable(
  "domains",
  {
    id: text().primaryKey(), // dom_…
    /** null for shared domains such as send0.email */
    orgId: text().references(() => orgs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text({ enum: ["shared", "custom", "sandbox"] }).notNull(),
    status: text({ enum: ["pending", "verified", "failed"] })
      .notNull()
      .default("pending"),
    dkimSelector: text(),
    /** DNS records the customer must publish, with last check results */
    records: jsonb().$type<unknown[]>().notNull().default([]),
    verifiedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("domains_name_idx").on(sql`lower(${t.name})`),
    index("domains_org_idx").on(t.orgId),
  ]
);

export const inboxes = pgTable(
  "inboxes",
  {
    id: text().primaryKey(), // ibx_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    domainId: text()
      .notNull()
      .references(() => domains.id),
    localPart: text().notNull(),
    displayName: text(),
    mode: text({ enum: ["live", "sandbox"] })
      .notNull()
      .default("live"),
    sendPolicy: text({ enum: ["open", "reply_only", "approval"] })
      .notNull()
      .default("reply_only"),
    status: text({ enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    retentionDays: integer().notNull().default(7),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Addresses are never reused, even after deletion: the row stays, so the unique index holds.
    uniqueIndex("inboxes_address_idx").on(
      t.domainId,
      sql`lower(${t.localPart})`
    ),
    index("inboxes_org_idx").on(t.orgId, t.createdAt.desc()),
  ]
);

// ---------- Mail ----------

export const threads = pgTable(
  "threads",
  {
    id: text().primaryKey(), // thr_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    inboxId: text()
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    subject: text().notNull().default(""),
    subjectNorm: text().notNull().default(""),
    /** Lowercased addresses of everyone on the thread except the inbox */
    participants: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    messageCount: integer().notNull().default(0),
    lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    labels: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index("threads_inbox_recent_idx").on(t.inboxId, t.lastMessageAt.desc()),
    index("threads_inbox_subject_idx").on(
      t.inboxId,
      t.subjectNorm,
      t.lastMessageAt.desc()
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: text().primaryKey(), // msg_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    inboxId: text()
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    threadId: text()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: text({ enum: ["in", "out"] }).notNull(),
    status: text({
      enum: [
        "received",
        "queued",
        "sent",
        "delivered",
        "bounced",
        "complained",
        "failed",
      ],
    }).notNull(),
    rfcMessageId: text(),
    inReplyTo: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    references: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    from: jsonb().$type<MailboxJson>(),
    to: jsonb().$type<MailboxJson[]>().notNull().default([]),
    cc: jsonb().$type<MailboxJson[]>().notNull().default([]),
    replyTo: jsonb().$type<MailboxJson[]>().notNull().default([]),
    subject: text().notNull().default(""),
    text: text(),
    html: text(),
    extractedText: text(),
    extracted: jsonb().$type<{
      otp: string | null;
      links: string[];
      actionLink: string | null;
    }>(),
    auth: jsonb().$type<{
      spf: string;
      dkim: string;
      dmarc: string;
      source: string | null;
    }>(),
    safety: jsonb().$type<{ promptInjection: string; reasons: string[] }>(),
    /** Plus-address tag the message was sent to, e.g. "task42" for bot+task42@ */
    tag: text(),
    size: integer().notNull().default(0),
    rawKey: text(),
    providerMessageId: text(),
    error: text(),
    sentAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    tsv: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', coalesce(${messages.subject}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${messages.extractedText}, ${messages.text}, '')), 'B')`
    ),
  },
  (t) => [
    index("messages_inbox_recent_idx").on(t.inboxId, t.createdAt.desc()),
    index("messages_thread_idx").on(t.threadId, t.createdAt),
    index("messages_rfc_id_idx").on(t.inboxId, t.rfcMessageId),
    // A sender retrying delivery must not create a second copy.
    uniqueIndex("messages_inbound_dedupe_idx")
      .on(t.inboxId, t.rfcMessageId)
      .where(sql`${t.direction} = 'in' and ${t.rfcMessageId} is not null`),
    index("messages_tsv_idx").using("gin", t.tsv),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: text().primaryKey(), // att_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    messageId: text()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text(),
    contentType: text().notNull(),
    size: integer().notNull(),
    contentId: text(),
    inline: boolean().notNull().default(false),
    blobKey: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_message_idx").on(t.messageId)]
);

export const drafts = pgTable(
  "drafts",
  {
    id: text().primaryKey(), // drf_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    inboxId: text()
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    threadId: text().references(() => threads.id, { onDelete: "set null" }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: text({ enum: ["pending", "approved", "rejected", "sent"] })
      .notNull()
      .default("pending"),
    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("drafts_inbox_idx").on(t.inboxId, t.createdAt.desc())]
);

export const suppressions = pgTable(
  "suppressions",
  {
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text().notNull(),
    reason: text({ enum: ["bounce", "complaint", "manual"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.email] })]
);

// ---------- Events and webhooks ----------

/** Outbox: every event is written in the same transaction as the change that caused it. */
export const events = pgTable(
  "events",
  {
    id: text().primaryKey(), // evt_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    inboxId: text(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Set once the event has been handed to the dispatcher */
    dispatchedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_org_recent_idx").on(t.orgId, t.createdAt.desc()),
    index("events_undispatched_idx")
      .on(t.createdAt)
      .where(sql`${t.dispatchedAt} is null`),
  ]
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: text().primaryKey(), // whk_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    url: text().notNull(),
    /** Signing secret, shown once at creation */
    secret: text().notNull(),
    events: text().array().notNull(),
    /** null = every inbox */
    inboxIds: text().array(),
    status: text({ enum: ["enabled", "disabled"] })
      .notNull()
      .default("enabled"),
    createdAt: createdAt(),
  },
  (t) => [index("webhooks_org_idx").on(t.orgId)]
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: text().primaryKey(), // dlv_…
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    webhookId: text()
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    status: text({ enum: ["pending", "succeeded", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer().notNull().default(0),
    lastStatusCode: integer(),
    lastError: text(),
    lastDurationMs: integer(),
    nextAttemptAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deliveries_webhook_event_idx").on(t.webhookId, t.eventId),
    index("deliveries_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ]
);

// ---------- Usage ----------

export const usage = pgTable(
  "usage",
  {
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** "2026-10" */
    period: text().notNull(),
    sent: integer().notNull().default(0),
    received: integer().notNull().default(0),
    storageBytes: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.period] })]
);
