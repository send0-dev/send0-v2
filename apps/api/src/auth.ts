import { looksLikeApiKey, sha256Hex } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { forbidden, unauthorized } from "./errors";
import { limitCaller, limitIp } from "./rate-limit";
import type { AppEnv, AuthContext, Scope } from "./types";

const { apiKeys, orgs } = schema;
const LAST_USED_RESOLUTION_MS = 60_000;

export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const preset = c.get("deps").presetAuth;
  if (preset) {
    // The dashboard already knows who this is; the workspace must still be in good standing.
    const [org] = await c
      .get("deps")
      .db.select({ status: orgs.status, deletedAt: orgs.deletedAt })
      .from(orgs)
      .where(eq(orgs.id, preset.orgId));
    if (!org || org.deletedAt) throw unauthorized();
    if (org.status !== "active") throw forbidden("This organization is suspended. Contact support@send0.dev.");
    await limitCaller(c, preset);
    c.set("auth", preset);
    return next();
  }
  const header = c.req.header("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  // A failed attempt counts against the client's address, so keys can't be guessed quickly.
  const rejected = async () => {
    await limitIp(c);
    return unauthorized();
  };
  if (!looksLikeApiKey(token)) throw await rejected();

  const { db, waitUntil, now = () => new Date() } = c.get("deps");
  const hash = await sha256Hex(token);
  const [row] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      mode: apiKeys.mode,
      scopes: apiKeys.scopes,
      inboxIds: apiKeys.inboxIds,
      lastUsedAt: apiKeys.lastUsedAt,
      orgStatus: orgs.status,
    })
    .from(apiKeys)
    .innerJoin(orgs, eq(orgs.id, apiKeys.orgId))
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) throw await rejected();
  if (row.orgStatus !== "active") throw forbidden("This organization is suspended. Contact support@send0.dev.");

  const at = now();
  if (!row.lastUsedAt || at.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    const touch = db
      .update(apiKeys)
      .set({ lastUsedAt: at })
      .where(eq(apiKeys.id, row.id))
      .then(() => undefined);
    waitUntil ? waitUntil(touch) : await touch;
  }

  const auth: AuthContext = {
    orgId: row.orgId,
    keyId: row.id,
    mode: row.mode,
    scopes: row.scopes as Scope[],
    inboxIds: row.inboxIds,
  };
  await limitCaller(c, auth);
  c.set("auth", auth);
  await next();
});

export function requireScope(auth: AuthContext, scope: Scope): void {
  // admin implies everything
  if (!auth.scopes.includes(scope) && !auth.scopes.includes("admin")) {
    throw forbidden(`This API key needs the "${scope}" scope.`);
  }
}

/** Keys restricted to specific inboxes may only touch those. Throws not_found so ids don't leak. */
export function canAccessInbox(auth: AuthContext, inboxId: string): boolean {
  return auth.inboxIds === null || auth.inboxIds.includes(inboxId);
}

/**
 * Approving or rejecting a draft needs a person (the dashboard) or an admin key,
 * so an agent holding a send key can't approve its own mail.
 */
export function requireApprover(auth: AuthContext): void {
  if (auth.actor === "user") return;
  if (!auth.scopes.includes("admin")) throw forbidden("Approving drafts needs an admin key or a signed-in member.");
}
