import { newApiKey, newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../auth";
import { forbidden, invalid, notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import { SCOPES, type AppEnv } from "../types";
import { validate } from "../validation";

const { apiKeys, inboxes } = schema;

export const serializeApiKey = (k: typeof apiKeys.$inferSelect) => ({
  object: "api_key" as const,
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  mode: k.mode,
  scopes: k.scopes,
  inbox_ids: k.inboxIds,
  last_used_at: k.lastUsedAt?.toISOString() ?? null,
  created_at: k.createdAt.toISOString(),
});

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(SCOPES as [string, ...string[]])).min(1).default(["read", "send"]),
  inbox_ids: z.array(z.string()).min(1).max(100).nullable().optional(),
});

export const apiKeyRoutes = new Hono<AppEnv>()
  .post("/", validate("json", createBody), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "admin");
    const { db } = c.get("deps");
    const body = c.req.valid("json");
    const inboxIds = body.inbox_ids ? [...new Set(body.inbox_ids)] : null;

    // A key can't mint a key with more reach than it has.
    if (auth.inboxIds && (!inboxIds || inboxIds.some((id) => !auth.inboxIds!.includes(id)))) {
      throw forbidden("This key is limited to specific inboxes, so new keys must be limited to a subset of them.");
    }
    if (inboxIds) {
      const found = await db
        .select({ id: inboxes.id })
        .from(inboxes)
        .where(and(eq(inboxes.orgId, auth.orgId), inArray(inboxes.id, inboxIds), isNull(inboxes.deletedAt)));
      const missing = inboxIds.filter((id) => !found.some((f) => f.id === id));
      if (missing.length) throw invalid(`Unknown inbox: ${missing[0]}`, "inbox_ids");
    }

    const secret = await newApiKey(auth.mode);
    const [row] = await db
      .insert(apiKeys)
      .values({
        id: newId("key"),
        orgId: auth.orgId,
        name: body.name,
        prefix: secret.prefix,
        hash: secret.hash,
        mode: auth.mode,
        scopes: body.scopes,
        inboxIds,
      })
      .returning();
    // The only time the full key is ever returned.
    return c.json({ ...serializeApiKey(row!), key: secret.key }, 201);
  })

  .get("/", validate("query", listQuery), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "admin");
    const { limit, cursor } = c.req.valid("query");
    const rows = await c
      .get("deps")
      .db.select()
      .from(apiKeys)
      .where(and(eq(apiKeys.orgId, auth.orgId), isNull(apiKeys.revokedAt), pageWhere(cursor, apiKeys.createdAt, apiKeys.id)))
      .orderBy(...pageOrder(apiKeys.createdAt, apiKeys.id))
      .limit(limit + 1);
    return c.json(toPage(rows, limit, (r) => ({ at: r.createdAt, id: r.id }), serializeApiKey));
  })

  .delete("/:id", async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "admin");
    const { db, now = () => new Date() } = c.get("deps");
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: now() })
      .where(and(eq(apiKeys.id, c.req.param("id")), eq(apiKeys.orgId, auth.orgId), isNull(apiKeys.revokedAt)))
      .returning();
    if (!row) throw notFound("api key", c.req.param("id"));
    return c.json({ ...serializeApiKey(row), revoked: true });
  });
