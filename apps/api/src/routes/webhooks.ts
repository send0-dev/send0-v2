import { newId, newWebhookSecret } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../auth";
import { forbidden, invalid, notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { webhooks, deliveries, events, inboxes } = schema;

export const EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "draft.created",
  "domain.verified",
  "inbox.suspended",
] as const;

type WebhookRow = typeof webhooks.$inferSelect;

const serializeWebhook = (w: WebhookRow) => ({
  object: "webhook" as const,
  id: w.id,
  url: w.url,
  events: w.events,
  inbox_ids: w.inboxIds,
  status: w.status,
  created_at: w.createdAt.toISOString(),
});

const serializeDelivery = (d: typeof deliveries.$inferSelect, eventType?: string) => ({
  object: "delivery" as const,
  id: d.id,
  webhook_id: d.webhookId,
  event_id: d.eventId,
  event_type: eventType ?? null,
  status: d.status,
  attempts: d.attempts,
  last_status_code: d.lastStatusCode,
  last_error: d.lastError,
  last_duration_ms: d.lastDurationMs,
  next_attempt_at: d.nextAttemptAt?.toISOString() ?? null,
  created_at: d.createdAt.toISOString(),
  updated_at: d.updatedAt.toISOString(),
});

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" && !PRIVATE_HOST.test(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "must be a public https:// URL");

const eventsSchema = z.array(z.enum([...EVENT_TYPES, "*"])).min(1).max(20);

const createBody = z.object({
  url: urlSchema,
  events: eventsSchema.default(["*"]),
  inbox_ids: z.array(z.string()).min(1).max(100).nullable().optional(),
});

const updateBody = z
  .object({ url: urlSchema, events: eventsSchema, inbox_ids: z.array(z.string()).min(1).max(100).nullable(), status: z.enum(["enabled", "disabled"]) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "send at least one field to update");

const MAX_WEBHOOKS_PER_ORG = 20;

export const webhookRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    const auth = c.get("auth");
    requireScope(auth, "admin");
    if (auth.inboxIds) throw forbidden("Webhooks are managed with an org-wide admin key.");
    await next();
  })

  .post("/", validate("json", createBody), async (c) => {
    const { orgId } = c.get("auth");
    const { db } = c.get("deps");
    const body = c.req.valid("json");
    const existing = await db.$count(webhooks, eq(webhooks.orgId, orgId));
    if (existing >= MAX_WEBHOOKS_PER_ORG) throw invalid(`An organization can have at most ${MAX_WEBHOOKS_PER_ORG} webhooks.`);
    if (body.inbox_ids) await assertInboxes(c, body.inbox_ids);

    const secret = newWebhookSecret();
    const [row] = await db
      .insert(webhooks)
      .values({ id: newId("whk"), orgId, url: body.url, secret, events: [...new Set(body.events)], inboxIds: body.inbox_ids ?? null })
      .returning();
    // The signing secret is only shown here and on rotation.
    return c.json({ ...serializeWebhook(row!), secret }, 201);
  })

  .get("/", validate("query", listQuery), async (c) => {
    const { limit, cursor } = c.req.valid("query");
    const rows = await c
      .get("deps")
      .db.select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, c.get("auth").orgId), pageWhere(cursor, webhooks.createdAt, webhooks.id)))
      .orderBy(...pageOrder(webhooks.createdAt, webhooks.id))
      .limit(limit + 1);
    return c.json(toPage(rows, limit, (w) => ({ at: w.createdAt, id: w.id }), serializeWebhook));
  })

  .get("/:id", async (c) => c.json(serializeWebhook(await load(c, c.req.param("id")))))

  .patch("/:id", validate("json", updateBody), async (c) => {
    const hook = await load(c, c.req.param("id"));
    const body = c.req.valid("json");
    if (body.inbox_ids) await assertInboxes(c, body.inbox_ids);
    const [row] = await c
      .get("deps")
      .db.update(webhooks)
      .set({
        ...(body.url ? { url: body.url } : {}),
        ...(body.events ? { events: [...new Set(body.events)] } : {}),
        ...(body.inbox_ids !== undefined ? { inboxIds: body.inbox_ids } : {}),
        ...(body.status ? { status: body.status } : {}),
      })
      .where(eq(webhooks.id, hook.id))
      .returning();
    return c.json(serializeWebhook(row!));
  })

  .delete("/:id", async (c) => {
    const hook = await load(c, c.req.param("id"));
    await c.get("deps").db.delete(webhooks).where(eq(webhooks.id, hook.id));
    return c.json({ ...serializeWebhook(hook), deleted: true });
  })

  .post("/:id/rotate-secret", async (c) => {
    const hook = await load(c, c.req.param("id"));
    const secret = newWebhookSecret();
    const [row] = await c.get("deps").db.update(webhooks).set({ secret }).where(eq(webhooks.id, hook.id)).returning();
    return c.json({ ...serializeWebhook(row!), secret });
  })

  // Sends a webhook.test event to this endpoint only.
  .post("/:id/test", async (c) => {
    const hook = await load(c, c.req.param("id"));
    const { db, queue, now = () => new Date() } = c.get("deps");
    const at = now();
    const eventId = newId("evt");
    const deliveryId = newId("dlv");
    await db.transaction(async (tx) => {
      await tx.insert(events).values({
        id: eventId,
        orgId: hook.orgId,
        type: "webhook.test",
        payload: { data: { webhook_id: hook.id, message: "This is a test event from send0." } },
        dispatchedAt: at,
        createdAt: at,
      });
      await tx.insert(deliveries).values({ id: deliveryId, orgId: hook.orgId, webhookId: hook.id, eventId, nextAttemptAt: at });
    });
    await queue?.send({ kind: "deliver", deliveryId });
    return c.json({ object: "event", id: eventId, type: "webhook.test", delivery_id: deliveryId }, 202);
  })

  .get("/:id/deliveries", validate("query", listQuery.extend({ status: z.enum(["pending", "succeeded", "failed"]).optional() })), async (c) => {
    const hook = await load(c, c.req.param("id"));
    const { limit, cursor, status } = c.req.valid("query");
    const rows = await c
      .get("deps")
      .db.select({ d: deliveries, type: events.type })
      .from(deliveries)
      .innerJoin(events, eq(events.id, deliveries.eventId))
      .where(and(eq(deliveries.webhookId, hook.id), status ? eq(deliveries.status, status) : undefined, pageWhere(cursor, deliveries.createdAt, deliveries.id)))
      .orderBy(...pageOrder(deliveries.createdAt, deliveries.id))
      .limit(limit + 1);
    return c.json(toPage(rows, limit, (r) => ({ at: r.d.createdAt, id: r.d.id }), (r) => serializeDelivery(r.d, r.type)));
  })

  // Replay: queue another attempt now, whatever happened before.
  .post("/:id/deliveries/:deliveryId/retry", async (c) => {
    const hook = await load(c, c.req.param("id"));
    const { db, queue, now = () => new Date() } = c.get("deps");
    const [row] = await db
      .update(deliveries)
      .set({ status: "pending", nextAttemptAt: now(), attempts: 0 })
      .where(and(eq(deliveries.id, c.req.param("deliveryId")), eq(deliveries.webhookId, hook.id)))
      .returning();
    if (!row) throw notFound("delivery", c.req.param("deliveryId"));
    await queue?.send({ kind: "deliver", deliveryId: row.id });
    return c.json(serializeDelivery(row), 202);
  });

async function load(c: { get: (k: any) => any }, id: string): Promise<WebhookRow> {
  const { orgId } = c.get("auth");
  const [row] = await c.get("deps").db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)));
  if (!row) throw notFound("webhook", id);
  return row;
}

async function assertInboxes(c: { get: (k: any) => any }, ids: string[]) {
  const { orgId } = c.get("auth");
  const found = await c
    .get("deps")
    .db.select({ id: inboxes.id })
    .from(inboxes)
    .where(and(eq(inboxes.orgId, orgId), isNull(inboxes.deletedAt)));
  const missing = ids.find((id) => !found.some((f: { id: string }) => f.id === id));
  if (missing) throw invalid(`Unknown inbox: ${missing}`, "inbox_ids");
}
