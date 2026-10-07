import { schema } from "@send0/db";
import { hubName, toEnvelope } from "@send0/pipeline";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { loadInbox } from "../access";
import { requireScope } from "../auth";
import { ApiError, forbidden } from "../errors";
import { formatSse } from "../realtime/hub-state";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { events } = schema;
const REPLAY_LIMIT = 500;

export const streamQuery = z.object({ inbox_id: z.string().max(40).optional() });

/** Mounted at /v1/events */
export const eventRoutes = new Hono<AppEnv>().get("/stream", validate("query", streamQuery), async (c) => {
  const auth = c.get("auth");
  requireScope(auth, "read");
  const { db, hub } = c.get("deps");
  if (!hub) throw new ApiError(503, "unavailable", "Real-time streaming is not available on this server.");

  const { inbox_id } = c.req.valid("query");
  if (!inbox_id && auth.inboxIds) throw forbidden("Keys limited to specific inboxes must pass inbox_id.");
  if (inbox_id) await loadInbox(c, inbox_id);
  const name = inbox_id ? hubName.inbox(inbox_id) : hubName.org(auth.orgId);

  // Resume: replay what the client missed since Last-Event-ID, from the outbox.
  let replay = "";
  const lastId = c.req.header("last-event-id");
  if (lastId) {
    const [last] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, lastId), eq(events.orgId, auth.orgId)));
    if (last) {
      const missed = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.orgId, auth.orgId),
            inbox_id ? eq(events.inboxId, inbox_id) : undefined,
            or(gt(events.createdAt, last.createdAt), and(eq(events.createdAt, last.createdAt), gt(events.id, last.id))),
          ),
        )
        .orderBy(asc(events.createdAt), asc(events.id))
        .limit(REPLAY_LIMIT);
      replay = missed.map((e) => formatSse(toEnvelope(e))).join("");
    }
  }

  const upstream = await hub.stream(name, c.req.raw.signal);
  if (!upstream.body) throw new ApiError(502, "unavailable", "Could not open the event stream.");

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  void (async () => {
    await writer.write(enc.encode(`retry: 3000\n: connected to ${name}\n\n${replay}`));
    writer.releaseLock();
    await upstream.body!.pipeTo(writable).catch(() => {});
  })();

  return new Response(readable, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
});
