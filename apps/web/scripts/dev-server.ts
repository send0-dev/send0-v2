/**
 * The whole dashboard locally, with no cloud services: built SPA + auth + the real API in-process,
 * in-memory Postgres, a mailer that records emails, and in-process real-time hubs.
 *
 *   pnpm --filter @send0/web build && pnpm --filter @send0/web exec tsx scripts/dev-server.ts [port]
 *
 * Dev-only helpers (never deployed):
 *   GET  /__dev/email?to=…           → latest email to that address, with its link
 *   POST /__dev/deliver {to, fixture} → simulate an inbound email
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { SendRawInput } from "@send0/adapters/mailer";
import { AuthService } from "@send0/auth";
import { parseInbound } from "@send0/core";
import { schema } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { hubName } from "@send0/pipeline";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp as createApi } from "../../api/src/app";
import type { HubClient } from "../../api/src/realtime/client";
import { HubState } from "../../api/src/realtime/hub-state";
import { deliver } from "../../api/test/helpers";
import { createWebApp } from "../worker/app";

const port = Number(process.argv[2] ?? 5173);
const appUrl = `http://127.0.0.1:${port}`;
const { db } = await createTestDb();
await db.insert(schema.domains).values({ id: "dom_shared", name: "send0.email", kind: "shared", status: "verified" });

const sent: SendRawInput[] = [];
const auth = new AuthService({ db, mailer: { sendRaw: async (m) => (sent.push(m), { providerMessageId: "dev" }) }, from: { name: "send0", email: "noreply@send0.dev" }, appUrl });

const hubs = new Map<string, HubState>();
const hub = (n: string) => hubs.get(n) ?? hubs.set(n, new HubState()).get(n)!;
const hubClient: HubClient = { wait: (i, f, s, t) => hub(hubName.inbox(i)).wait(f, s, t), stream: async () => new Response("") };

const web = createWebApp({
  auth,
  appUrl,
  secureCookies: false,
  gateway: async (req, orgId, userId) =>
    createApi({
      db,
      files: { signedGetUrl: async (k) => `${appUrl}/__dev/file/${encodeURIComponent(k)}` },
      hub: hubClient,
      queue: { send: async () => {} },
      mailer: { sendRaw: async () => ({ providerMessageId: "dev" }) },
      presetAuth: { orgId, keyId: userId, mode: "live", scopes: ["admin"], inboxIds: null },
    }).fetch(req),
});

const root = new Hono();
root.get("/__dev/email", async (c) => {
  const to = c.req.query("to");
  const m = [...sent].reverse().find((x) => x.recipients.includes(to ?? ""));
  if (!m) return c.json({ error: "none" }, 404);
  const p = await parseInbound(m.raw, { trustedAuthservIds: [] });
  return c.json({ subject: p.subject, link: p.text.match(/https?:\/\/\S+/)?.[0] ?? null });
});
root.post("/__dev/deliver", async (c) => {
  const { to, fixture } = await c.req.json<{ to: string; fixture: string }>();
  const raw = readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${fixture}`, import.meta.url).href));
  const r = await deliver(db, to, raw);
  if (!r.duplicate) hub(hubName.inbox(r.envelope.inbox_id!)).notify(r.envelope);
  return c.json({ message_id: r.messageId });
});
root.all("/auth/*", (c) => web.fetch(c.req.raw));
root.all("/api/*", (c) => web.fetch(c.req.raw));
const dist = fileURLToPath(new URL("../dist/client", import.meta.url).href);
root.use("/*", serveStatic({ root: dist }));
root.get("*", serveStatic({ path: `${dist}/index.html` })); // SPA fallback

serve({ fetch: root.fetch, port, hostname: "127.0.0.1" }, () => console.log(JSON.stringify({ url: appUrl })));
