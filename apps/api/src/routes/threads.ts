import { schema } from "@send0/db";
import { serializeMessage, serializeThread } from "@send0/pipeline";
import { and, asc, eq, inArray } from "drizzle-orm";
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
    return c.json(toPage(rows, limit, (t) => ({ at: t.lastMessageAt, id: t.id }), serializeThread));
  })

  .get(
    "/:threadId",
    validate("query", threadGetQuery),
    async (c) => {
      requireScope(c.get("auth"), "read");
      const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
      const { db } = c.get("deps");
      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, c.req.param("threadId")), eq(threads.inboxId, inbox.id)));
      if (!thread) throw notFound("thread", c.req.param("threadId"));

      // Oldest first, so an agent reads the conversation in order.
      const msgs = await db.select().from(messages).where(eq(messages.threadId, thread.id)).orderBy(asc(messages.createdAt), asc(messages.id)).limit(200);
      const atts = msgs.length
        ? await db.select().from(attachments).where(inArray(attachments.messageId, msgs.map((m) => m.id)))
        : [];
      const includeHtml = c.req.valid("query").include_html;
      return c.json({
        ...serializeThread(thread),
        messages: msgs.map((m) => serializeMessage(m, atts.filter((a) => a.messageId === m.id), { includeHtml })),
      });
    },
  );
