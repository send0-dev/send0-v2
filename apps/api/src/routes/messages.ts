import { schema } from "@send0/db";
import { serializeAttachment, serializeMessage } from "@send0/pipeline";
import { and, asc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { loadInbox, loadMessage } from "../access";
import { requireScope } from "../auth";
import { notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { messages, attachments } = schema;

/** Download links stay valid for 15 minutes. */
export const DOWNLOAD_TTL_SECONDS = 15 * 60;

export const messageFilters = z.object({
  direction: z.enum(["in", "out"]).optional(),
  /** Exact address or a wildcard such as *@acme.dev */
  from: z.string().trim().toLowerCase().max(254).optional(),
  subject: z.string().trim().max(200).optional(),
  thread_id: z.string().max(40).optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  /** Full-text search over subject and body */
  q: z.string().trim().min(1).max(200).optional(),
});

/** SQL conditions for the filters, shared by the list endpoint and `wait`. */
export function filterConditions(f: z.infer<typeof messageFilters>): (SQL | undefined)[] {
  const fromPattern = f.from ? f.from.replace(/[\\%_]/g, (ch) => `\\${ch}`).replace(/\*/g, "%") : null;
  return [
    f.direction ? eq(messages.direction, f.direction) : undefined,
    fromPattern ? sql`lower(${messages.from}->>'email') like ${fromPattern}` : undefined,
    f.subject ? sql`${messages.subject} ilike ${`%${f.subject.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}` : undefined,
    f.thread_id ? eq(messages.threadId, f.thread_id) : undefined,
    f.since ? gte(messages.createdAt, new Date(f.since)) : undefined,
    f.q ? sql`${messages.tsv} @@ websearch_to_tsquery('simple', ${f.q})` : undefined,
  ];
}

export async function withAttachments(db: AppEnv["Variables"]["deps"]["db"], rows: (typeof messages.$inferSelect)[]) {
  if (!rows.length) return new Map<string, (typeof attachments.$inferSelect)[]>();
  const atts = await db.select().from(attachments).where(inArray(attachments.messageId, rows.map((m) => m.id)));
  const map = new Map<string, (typeof attachments.$inferSelect)[]>();
  for (const a of atts) map.set(a.messageId, [...(map.get(a.messageId) ?? []), a]);
  return map;
}

export const MAX_WAIT_SECONDS = 120;
/** Default look-back for `wait`, so a message that landed just before the call still counts. */
export const WAIT_DEFAULT_LOOKBACK_MS = 60_000;

const waitQuery = z.object({
  timeout: z.coerce.number().int().min(1).max(MAX_WAIT_SECONDS).default(30),
  since: z.iso.datetime({ offset: true }).optional(),
  from: messageFilters.shape.from,
  subject: messageFilters.shape.subject,
  direction: z.enum(["in", "out"]).default("in"),
});

/** Mounted at /v1/inboxes/:inboxId/messages */
export const inboxMessageRoutes = new Hono<AppEnv>()
  /**
   * Long-poll: returns the first message matching the filters received at or after `since`
   * (default: one minute before the call), waiting up to `timeout` seconds for it to arrive.
   */
  .get("/wait", validate("query", waitQuery), async (c) => {
    requireScope(c.get("auth"), "read");
    const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
    const q = c.req.valid("query");
    const { db, hub, now = () => new Date() } = c.get("deps");
    const since = q.since ? new Date(q.since) : new Date(now().getTime() - WAIT_DEFAULT_LOOKBACK_MS);
    const filter = { direction: q.direction, ...(q.from ? { from: q.from } : {}), ...(q.subject ? { subject: q.subject } : {}) };

    const respond = async (m: typeof messages.$inferSelect | undefined) => {
      if (!m) return c.json({ object: "wait_result", timed_out: true, message: null });
      const atts = await withAttachments(db, [m]);
      return c.json({ object: "wait_result", timed_out: false, message: serializeMessage(m, atts.get(m.id) ?? []) });
    };

    // 1. Already here? The hub keeps recent events, so nothing slips through between this check and step 2.
    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.inboxId, inbox.id), ...filterConditions({ ...filter, since: since.toISOString() })))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(1);
    if (existing || !hub) return respond(existing);

    // 2. Block on the inbox's hub until a match arrives or the timeout passes.
    const event = await hub.wait(inbox.id, filter, since.getTime(), q.timeout * 1000);
    if (!event) return respond(undefined);
    const [arrived] = await db.select().from(messages).where(and(eq(messages.id, String(event.data.id)), eq(messages.inboxId, inbox.id)));
    return respond(arrived);
  })

  .get("/", validate("query", listQuery.extend(messageFilters.shape)), async (c) => {
  requireScope(c.get("auth"), "read");
  const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
  const { limit, cursor, ...filters } = c.req.valid("query");
  const { db } = c.get("deps");
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.inboxId, inbox.id), ...filterConditions(filters), pageWhere(cursor, messages.createdAt, messages.id)))
    .orderBy(...pageOrder(messages.createdAt, messages.id))
    .limit(limit + 1);
  const atts = await withAttachments(db, rows);
  return c.json(toPage(rows, limit, (m) => ({ at: m.createdAt, id: m.id }), (m) => serializeMessage(m, atts.get(m.id) ?? [])));
});

/** Mounted at /v1/messages */
export const messageRoutes = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    requireScope(c.get("auth"), "read");
    const message = await loadMessage(c, c.req.param("id"));
    const atts = await withAttachments(c.get("deps").db, [message]);
    return c.json(serializeMessage(message, atts.get(message.id) ?? [], { includeHtml: true }));
  })

  // The original .eml, through a short-lived download link.
  .get("/:id/raw", async (c) => {
    requireScope(c.get("auth"), "read");
    const message = await loadMessage(c, c.req.param("id"));
    if (!message.rawKey) throw notFound("raw message", message.id);
    const url = await c.get("deps").files.signedGetUrl(message.rawKey, {
      expiresIn: DOWNLOAD_TTL_SECONDS,
      filename: `${message.id}.eml`,
      contentType: "message/rfc822",
    });
    return c.redirect(url, 302);
  })

  .get("/:id/attachments/:attachmentId", async (c) => {
    requireScope(c.get("auth"), "read");
    const message = await loadMessage(c, c.req.param("id"));
    const [att] = await c
      .get("deps")
      .db.select()
      .from(attachments)
      .where(and(eq(attachments.id, c.req.param("attachmentId")), eq(attachments.messageId, message.id)));
    if (!att) throw notFound("attachment", c.req.param("attachmentId"));
    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000);
    const url = await c.get("deps").files.signedGetUrl(att.blobKey, {
      expiresIn: DOWNLOAD_TTL_SECONDS,
      filename: att.filename,
      contentType: att.contentType,
    });
    return c.json({ object: "attachment", ...serializeAttachment(att), message_id: message.id, download_url: url, expires_at: expiresAt.toISOString() });
  });
