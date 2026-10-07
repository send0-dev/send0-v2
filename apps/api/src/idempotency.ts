import { sha256Hex } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError, conflict, invalid } from "./errors";
import type { AppEnv } from "./types";

const { idempotencyKeys } = schema;
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotency-Key on POST: the first request with a key runs and its response is stored;
 * retries with the same key and body get the stored response back. Keys expire after 24 hours.
 */
export const idempotency = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.req.header("idempotency-key");
  if (c.req.method !== "POST" || !key) return next();
  if (key.length > 255) throw invalid("Idempotency-Key must be at most 255 characters.", "Idempotency-Key");

  const { db, now = () => new Date() } = c.get("deps");
  const { orgId } = c.get("auth");
  const route = `${c.req.method} ${c.req.path}`;
  const requestHash = await sha256Hex(`${route}\n${await c.req.raw.clone().text()}`);
  const where = and(eq(idempotencyKeys.orgId, orgId), eq(idempotencyKeys.key, key));

  const claimed = await db
    .insert(idempotencyKeys)
    .values({ orgId, key, route, requestHash, createdAt: now() })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (claimed.length === 0) {
    const [prev] = await db.select().from(idempotencyKeys).where(where);
    if (prev && now().getTime() - prev.createdAt.getTime() > TTL_MS) {
      // Expired: reuse the key for this new request.
      await db.update(idempotencyKeys).set({ route, requestHash, responseStatus: null, responseBody: null, createdAt: now() }).where(where);
    } else if (prev) {
      if (prev.requestHash !== requestHash) {
        throw new ApiError(
          422,
          "idempotency_key_reused",
          "This Idempotency-Key was already used with a different request.",
          "Idempotency-Key",
        );
      }
      if (prev.responseStatus === null) {
        throw conflict("idempotency_in_progress", "A request with this Idempotency-Key is still being processed. Retry shortly.");
      }
      c.header("Idempotent-Replayed", "true");
      return c.json(prev.responseBody as object, prev.responseStatus as ContentfulStatusCode);
    }
  }

  let stored = false;
  try {
    await next();
    // Store successful and client-error responses; drop the claim on server errors so a retry can run.
    if (c.res.status < 500 && c.res.headers.get("content-type")?.includes("application/json")) {
      const body = await c.res.clone().json();
      await db.update(idempotencyKeys).set({ responseStatus: c.res.status, responseBody: body }).where(where);
      stored = true;
    }
  } finally {
    if (!stored) await db.delete(idempotencyKeys).where(where);
  }
});
