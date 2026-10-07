/**
 * The real API on Node with an in-memory Postgres (PGlite), a fake mailer and in-process hubs.
 * For SDK end-to-end tests. Never deployed.
 *
 *   pnpm --filter @send0/api exec tsx scripts/test-server.ts [port]
 *
 * Prints one JSON line on stdout: {"url":"http://127.0.0.1:PORT","key":"s0_live_…"}.
 * Test-only endpoints (no auth): POST /__test/deliver {"to": "a@send0.email", "fixture": "otp-html-only.eml"}
 */
import { serve } from "@hono/node-server";
import { newApiKey, newId } from "@send0/core";
import { schema } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { hubName, HubState } from "@send0/pipeline";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app";
import type { HubClient } from "../src/realtime/client";
import { deliver } from "../test/helpers";

const port = Number(process.argv[2] ?? 0);
const { db } = await createTestDb();
const orgId = newId("org");
// Scale plan and a high daily cap, so suites can create many inboxes and send freely.
await db.insert(schema.orgs).values({ id: orgId, name: "SDK e2e", plan: "scale", dailySendLimit: 10_000 });
await db.insert(schema.domains).values({ id: newId("dom"), name: "send0.email", kind: "shared", status: "verified" });
const key = await newApiKey("live");
await db
  .insert(schema.apiKeys)
  .values({ id: newId("key"), orgId, name: "e2e", prefix: key.prefix, hash: key.hash, mode: "live", scopes: ["admin"] });

const hubs = new Map<string, HubState>();
const hub = (n: string) => hubs.get(n) ?? hubs.set(n, new HubState()).get(n)!;
const hubClient: HubClient = {
  wait: (inboxId, f, since, timeout) => hub(hubName.inbox(inboxId)).wait(f, since, timeout),
  stream: async (name) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const w = writable.getWriter();
    hub(name).subscribe((c) => w.write(new TextEncoder().encode(c)));
    return new Response(readable);
  },
};

const api = createApp({
  db,
  files: { signedGetUrl: async (k) => `https://files.test/${k}` },
  hub: hubClient,
  queue: { send: async () => {} },
  mailer: { sendRaw: async () => ({ providerMessageId: `ses-${Date.now()}` }) },
});

const root = new Hono();
root.post("/__test/deliver", async (c) => {
  const { to, fixture } = await c.req.json<{ to: string; fixture: string }>();
  const raw = readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${fixture}`, import.meta.url).href));
  const r = await deliver(db, to, raw);
  if (!r.duplicate) {
    for (const name of [hubName.org(orgId), hubName.inbox(r.envelope.inbox_id!)]) hub(name).notify(r.envelope);
  }
  return c.json({ message_id: r.messageId, duplicate: r.duplicate });
});
root.route("/", api);

const server = serve({ fetch: root.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(JSON.stringify({ url: `http://127.0.0.1:${info.port}`, key: key.key }));
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
