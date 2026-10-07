/**
 * The whole dashboard locally, with no cloud services: the built SPA, the dashboard Worker's
 * routes, and the real API in-process, on an in-memory Postgres. Email is recorded instead of
 * sent, and real-time hubs (wait + live SSE) run in memory.
 *
 *   pnpm --filter @send0/web build && pnpm --filter @send0/web exec tsx scripts/dev-server.ts [port]
 *
 * Dev-only helpers (never deployed):
 *   GET  /__dev/email?to=…             → the newest email to that address, with its first link
 *   POST /__dev/deliver {to, fixture}  → simulate an inbound email from fixtures/emails/
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { SendRawInput } from "@send0/adapters/mailer";
import { createAuth } from "@send0/auth";
import { parseInbound } from "@send0/core";
import { schema } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { findInboxByAddress, hubName, HubState, type EventEnvelope, type HubClient } from "@send0/pipeline";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp as createApi } from "../../api/src/app";
import { deliver } from "../../api/test/helpers";
import { createWebApp } from "../worker/app";

const port = Number(process.argv[2] ?? 5173);
const appUrl = `http://127.0.0.1:${port}`;
const { db } = await createTestDb();
await db.insert(schema.domains).values({ id: "dom_shared", name: "send0.email", kind: "shared", status: "verified" });

const sent: SendRawInput[] = [];
const recordMail = { sendRaw: async (m: SendRawInput) => (sent.push(m), { providerMessageId: `dev-${sent.length}` }) };
const auth = createAuth({ db, mailer: recordMail, from: { name: "send0", email: "noreply@send0.dev" }, appUrl });

// In-memory stand-ins for the per-inbox and per-org Durable Objects.
const hubs = new Map<string, HubState>();
const hub = (name: string) => hubs.get(name) ?? hubs.set(name, new HubState()).get(name)!;
const hubClient: HubClient = {
  wait: (inboxId, filter, sinceMs, timeoutMs) => hub(hubName.inbox(inboxId)).wait(filter, sinceMs, timeoutMs),
  stream: async (name, signal) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const unsubscribe = hub(name).subscribe((chunk) => writer.write(enc.encode(chunk)));
    const ping = setInterval(() => hub(name).ping(), 15_000);
    signal.addEventListener("abort", () => {
      clearInterval(ping);
      unsubscribe();
      writer.close().catch(() => {});
    });
    return new Response(readable, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  },
};
const publish = async (orgId: string, e: EventEnvelope) => {
  hub(hubName.org(orgId)).notify(e);
  if (e.inbox_id) hub(hubName.inbox(e.inbox_id)).notify(e);
};

const web = createWebApp({
  auth,
  appUrl,
  secureCookies: false,
  instance: { mailDomains: ["send0.email"] },
  gateway: async (req, as) =>
    createApi({
      db,
      files: { signedGetUrl: async (k) => `${appUrl}/__dev/file/${encodeURIComponent(k)}` },
      hub: hubClient,
      queue: { send: async () => {} },
      mailer: recordMail,
      mailDomains: ["send0.email"],
      publish,
      presetAuth: { orgId: as.orgId, keyId: as.userId, mode: "live", scopes: as.scopes, inboxIds: null, actor: "user" },
    }).fetch(req),
});

const root = new Hono();
root.get("/__dev/email", async (c) => {
  const to = c.req.query("to") ?? "";
  const m = [...sent].reverse().find((x) => x.recipients.includes(to));
  if (!m) return c.json({ error: "none" }, 404);
  const p = await parseInbound(m.raw, { trustedAuthservIds: [] });
  return c.json({ subject: p.subject, link: p.text.match(/https?:\/\/\S+/)?.[0] ?? null });
});
root.post("/__dev/deliver", async (c) => {
  const { to, fixture } = await c.req.json<{ to: string; fixture: string }>();
  const raw = readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${fixture}`, import.meta.url).href));
  const [local, domain] = to.split("@") as [string, string];
  const inbox = await findInboxByAddress(db, local, domain);
  if (!inbox) return c.json({ error: `no inbox ${to}` }, 404);
  const r = await deliver(db, to, raw);
  if (!r.duplicate) await publish(inbox.orgId, r.envelope);
  return c.json({ message_id: r.messageId });
});
root.all("/auth/*", (c) => web.fetch(c.req.raw));
root.all("/api/*", (c) => web.fetch(c.req.raw));
const dist = fileURLToPath(new URL("../dist/client", import.meta.url).href);
root.use("/*", serveStatic({ root: dist }));
root.get("*", serveStatic({ path: `${dist}/index.html` })); // SPA fallback

serve({ fetch: root.fetch, port, hostname: "127.0.0.1" }, () => console.log(JSON.stringify({ url: appUrl })));
