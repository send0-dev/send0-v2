import { schema } from "@send0/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { canAccessInbox } from "./auth";
import { notFound } from "./errors";
import type { AppEnv } from "./types";

const { inboxes, domains, messages } = schema;

/**
 * Loads an inbox the current key may see. Anything else (other org, outside the key's scope,
 * deleted) is a 404, so ids from other tenants can't be probed.
 */
export async function loadInbox(c: Context<AppEnv>, inboxId: string) {
  const auth = c.get("auth");
  if (!canAccessInbox(auth, inboxId)) throw notFound("inbox", inboxId);
  const [row] = await c
    .get("deps")
    .db.select({ inbox: inboxes, domain: domains.name })
    .from(inboxes)
    .innerJoin(domains, eq(domains.id, inboxes.domainId))
    .where(and(eq(inboxes.id, inboxId), eq(inboxes.orgId, auth.orgId), isNull(inboxes.deletedAt)));
  if (!row) throw notFound("inbox", inboxId);
  return row;
}

export async function loadMessage(c: Context<AppEnv>, messageId: string) {
  const auth = c.get("auth");
  const [row] = await c
    .get("deps")
    .db.select({ message: messages })
    .from(messages)
    .innerJoin(inboxes, eq(inboxes.id, messages.inboxId))
    .where(and(eq(messages.id, messageId), eq(messages.orgId, auth.orgId), isNull(inboxes.deletedAt)));
  if (!row || !canAccessInbox(auth, row.message.inboxId)) throw notFound("message", messageId);
  return row.message;
}
