import { schema } from "@send0/db";
import { serializeMessage, serializeThread, type LatestMessage } from "@send0/pipeline";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { loadInbox } from "../access";
import { requireScope } from "../auth";
import { notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { threads, messages, attachments } = schema;

export const threadGetQuery = z.object({ include_html: z.stringbool().default(false) });

type MessageRow = typeof messages.$inferSelect;
const toLatest = (m: Pick<MessageRow, "id" | "direction" | "from" | "extractedText" | "text"> | undefined): LatestMessage | null =>
  m ? { id: m.id, direction: m.direction, from: m.from, text: m.extractedText ?? m.text } : null;

/** The newest message of each thread, in one query (DISTINCT ON thread). */
async function latestMessages(db: AppEnv["Variables"]["deps"]["db"], threadIds: string[]): Promise<Map<string, LatestMessage | null>> {
  if (!threadIds.length) return new Map();
  const rows = await db
    .selectDistinctOn([messages.threadId], {
      threadId: messages.threadId,
      id: messages.id,
      direction: messages.direction,
      from: messages.from,
      extractedText: messages.extractedText,
      text: messages.text,
    })
    .from(messages)
    .where(inArray(messages.threadId, threadIds))
    .orderBy(messages.threadId, desc(messages.createdAt), desc(messages.id));
  return new Map(rows.map((r) => [r.threadId, toLatest(r)]));
}

/** Mounted at /v1/inboxes/:inboxId/threads */
export const threadRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listQuery), async (c) => {
    requireScope(c.get("auth"), "read");
    const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
    const { limit, cursor } = c.req.valid("query");
    const rows = await c
      .get("deps")
      .db.select()
      .from(threads)
      .where(and(eq(threads.inboxId, inbox.id), pageWhere(cursor, threads.lastMessageAt, threads.id)))
      .orderBy(...pageOrder(threads.lastMessageAt, threads.id))
      .limit(limit + 1);
    const latest = await latestMessages(
      c.get("deps").db,
      rows.slice(0, limit).map((t) => t.id),
    );
    return c.json(
      toPage(
        rows,
        limit,
        (t) => ({ at: t.lastMessageAt, id: t.id }),
        (t) => serializeThread(t, latest.get(t.id)),
      ),
    );
  })

  .get("/:threadId", validate("query", threadGetQuery), async (c) => {
    requireScope(c.get("auth"), "read");
    const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
    const { db } = c.get("deps");
    const [thread] = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, c.req.param("threadId")), eq(threads.inboxId, inbox.id)));
    if (!thread) throw notFound("thread", c.req.param("threadId"));

    // Oldest first, so an agent reads the conversation in order.
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, thread.id))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(200);
    const atts = msgs.length
      ? await db
          .select()
          .from(attachments)
          .where(
            inArray(
              attachments.messageId,
              msgs.map((m) => m.id),
            ),
          )
      : [];
    const includeHtml = c.req.valid("query").include_html;
    return c.json({
      ...serializeThread(thread, toLatest(msgs.at(-1))),
      messages: msgs.map((m) =>
        serializeMessage(
          m,
          atts.filter((a) => a.messageId === m.id),
          { includeHtml },
        ),
      ),
    });
  });
