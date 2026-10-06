import { isReservedLocalPart, isValidLocalPart, newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, count, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { canAccessInbox, requireScope } from "../auth";
import { ApiError, conflict, forbidden, invalid, notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import type { AppEnv, AuthContext } from "../types";
import { validate } from "../validation";

const { inboxes, domains, orgs } = schema;

export const DEFAULT_DOMAIN = "send0.email";
export const PLAN_INBOX_LIMITS: Record<string, number> = { free: 5, pro: 100, scale: 1000 };

type InboxRow = typeof inboxes.$inferSelect;

export const serializeInbox = (i: InboxRow, domain: string) => ({
  object: "inbox" as const,
  id: i.id,
  address: `${i.localPart}@${domain}`,
  local_part: i.localPart,
  domain,
  display_name: i.displayName,
  mode: i.mode,
  send_policy: i.sendPolicy,
  status: i.status,
  retention_days: i.retentionDays,
  metadata: i.metadata,
  expires_at: i.expiresAt?.toISOString() ?? null,
  created_at: i.createdAt.toISOString(),
  updated_at: i.updatedAt.toISOString(),
});

const metadataSchema = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .refine((m) => Object.keys(m).length <= 20, "at most 20 keys");

const createBody = z.object({
  /** Local part; random when omitted */
  name: z.string().trim().toLowerCase().max(64).optional(),
  domain: z.string().trim().toLowerCase().max(253).optional(),
  display_name: z.string().trim().max(100).nullable().optional(),
  send_policy: z.enum(["open", "reply_only", "approval"]).optional(),
  metadata: metadataSchema.optional(),
  expires_at: z.iso.datetime({ offset: true }).optional(),
});

const updateBody = z
  .object({
    display_name: z.string().trim().max(100).nullable(),
    send_policy: z.enum(["open", "reply_only", "approval"]),
    metadata: metadataSchema,
    expires_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "send at least one field to update");

function randomLocalPart(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `agent-${[...bytes].map((b) => (b % 36).toString(36)).join("")}`;
}

/** Visible inboxes for this key: same org, not deleted, and inside the key's inbox scope. */
function visible(auth: AuthContext): SQL {
  return and(
    eq(inboxes.orgId, auth.orgId),
    isNull(inboxes.deletedAt),
    auth.inboxIds ? inArray(inboxes.id, auth.inboxIds) : undefined,
  )!;
}

async function loadInbox(c: { get: (k: "deps") => AppEnv["Variables"]["deps"] }, auth: AuthContext, id: string) {
  if (!canAccessInbox(auth, id)) throw notFound("inbox", id);
  const [row] = await c
    .get("deps")
    .db.select({ inbox: inboxes, domain: domains.name })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(and(eq(inboxes.id, id), visible(auth)));
  if (!row) throw notFound("inbox", id);
  return row;
}

export const inboxRoutes = new Hono<AppEnv>()
  .post("/", validate("json", createBody), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "send");
    if (auth.inboxIds) throw forbidden("Keys limited to specific inboxes can't create new inboxes.");
    const { db } = c.get("deps");
    const body = c.req.valid("json");

    const localPart = body.name ?? randomLocalPart();
    if (!isValidLocalPart(localPart)) {
      throw invalid("name may use a-z, 0-9, dots, dashes and underscores, and must start and end with a letter or digit.", "name");
    }
    if (isReservedLocalPart(localPart)) throw invalid(`"${localPart}" is reserved. Pick another name.`, "name");

    const domainName = body.domain ?? DEFAULT_DOMAIN;
    const [domain] = await db
      .select()
      .from(domains)
      .where(
        and(
          sql`lower(${domains.name}) = ${domainName}`,
          eq(domains.status, "verified"),
          or(eq(domains.kind, "shared"), eq(domains.orgId, auth.orgId)),
        ),
      );
    if (!domain) throw invalid(`${domainName} isn't a domain this account can use. Add and verify it first.`, "domain");

    const [org] = await db.select({ plan: orgs.plan }).from(orgs).where(eq(orgs.id, auth.orgId));
    const limit = PLAN_INBOX_LIMITS[org?.plan ?? "free"] ?? PLAN_INBOX_LIMITS.free!;
    const [{ n }] = (await db
      .select({ n: count() })
      .from(inboxes)
      .where(and(eq(inboxes.orgId, auth.orgId), isNull(inboxes.deletedAt)))) as [{ n: number }];
    if (n >= limit) {
      throw new ApiError(402, "plan_limit_reached", `Your plan allows ${limit} inboxes. Delete one or upgrade.`);
    }

    const [row] = await db
      .insert(inboxes)
      .values({
        id: newId("ibx"),
        orgId: auth.orgId,
        domainId: domain.id,
        localPart,
        displayName: body.display_name ?? null,
        sendPolicy: body.send_policy,
        metadata: body.metadata ?? {},
        expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("address_taken", `${localPart}@${domain.name} is taken. Pick another name.`, "name");
    return c.json(serializeInbox(row, domain.name), 201);
  })

  .get("/", validate("query", listQuery), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "read");
    const { limit, cursor } = c.req.valid("query");
    const rows = await c
      .get("deps")
      .db.select({ inbox: inboxes, domain: domains.name })
      .from(inboxes)
      .innerJoin(domains, eq(domains.id, inboxes.domainId))
      .where(and(visible(auth), pageWhere(cursor, inboxes.createdAt, inboxes.id)))
      .orderBy(...pageOrder(inboxes.createdAt, inboxes.id))
      .limit(limit + 1);
    return c.json(
      toPage(rows, limit, (r) => ({ at: r.inbox.createdAt, id: r.inbox.id }), (r) => serializeInbox(r.inbox, r.domain)),
    );
  })

  .get("/:id", async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "read");
    const { inbox, domain } = await loadInbox(c, auth, c.req.param("id"));
    return c.json(serializeInbox(inbox, domain));
  })

  .patch("/:id", validate("json", updateBody), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "send");
    const { inbox, domain } = await loadInbox(c, auth, c.req.param("id"));
    const body = c.req.valid("json");
    const [row] = await c
      .get("deps")
      .db.update(inboxes)
      .set({
        ...(body.display_name !== undefined ? { displayName: body.display_name } : {}),
        ...(body.send_policy ? { sendPolicy: body.send_policy } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
        ...(body.expires_at !== undefined ? { expiresAt: body.expires_at ? new Date(body.expires_at) : null } : {}),
      })
      .where(eq(inboxes.id, inbox.id))
      .returning();
    return c.json(serializeInbox(row!, domain));
  })

  .delete("/:id", async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "admin");
    const { inbox, domain } = await loadInbox(c, auth, c.req.param("id"));
    const { db, now = () => new Date() } = c.get("deps");
    // Soft delete: the address is never handed to anyone else, and mail to it is refused from now on.
    const [row] = await db
      .update(inboxes)
      .set({ status: "deleted", deletedAt: now() })
      .where(eq(inboxes.id, inbox.id))
      .returning();
    return c.json({ ...serializeInbox(row!, domain), deleted: true });
  });
