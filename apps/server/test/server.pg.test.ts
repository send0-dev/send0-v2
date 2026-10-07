import { parseInbound, verifyWebhook } from "@send0/core";
import { schema } from "@send0/db";
import { createPgTestDatabase, TEST_DATABASE_URL } from "@send0/db/testing-pg";
import { hubName } from "@send0/pipeline";
import { eq } from "drizzle-orm";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { startServer, type RunningServer } from "../src/server";
import { freePort, until } from "./support";

const MAIL_DOMAIN = "agents.acme.dev";
const PASSWORD = "tangerine-orbit-42";

interface SunkMail {
  from: string;
  to: string[];
  raw: string;
}
interface Hook {
  headers: IncomingHttpHeaders;
  body: string;
}

/** An SMTP relay that accepts everything and records it. */
async function startSink(): Promise<{ server: SMTPServer; port: number; mail: SunkMail[] }> {
  const mail: SunkMail[] = [];
  const server = new SMTPServer({
    secure: false,
    disabledCommands: ["STARTTLS", "AUTH"],
    logger: false,
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        mail.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString("utf8"),
        });
        cb();
      });
    },
  });
  server.on("error", () => {});
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: (server.server.address() as AddressInfo).port, mail };
}

/** A webhook endpoint that records every POST. */
async function startReceiver(): Promise<{ server: Server; port: number; hooks: Hook[] }> {
  const hooks: Hook[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      hooks.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: (server.address() as AddressInfo).port, hooks };
}

describe.skipIf(!TEST_DATABASE_URL)("send0 server (Postgres)", () => {
  let base: string;
  let server: RunningServer;
  let sink: Awaited<ReturnType<typeof startSink>>;
  let receiver: Awaited<ReturnType<typeof startReceiver>>;
  let drop: () => Promise<void>;
  let tmp: string;

  beforeAll(async () => {
    sink = await startSink();
    receiver = await startReceiver();
    const db = await createPgTestDatabase();
    drop = db.drop;
    tmp = await mkdtemp(path.join(tmpdir(), "send0-server-"));
    await writeFile(path.join(tmp, "index.html"), "<!doctype html><title>send0 stub</title>");
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const config = loadConfig({
      DOMAIN: "mail.acme.dev",
      MAIL_DOMAIN,
      PUBLIC_URL: base,
      PORT: String(port),
      SECRET_KEY: "x".repeat(48),
      DATABASE_URL: db.url,
      SMTP_URL: `smtp://127.0.0.1:${sink.port}?require_tls=false`,
      BLOB_DIR: path.join(tmp, "blobs"),
      WEB_DIR: tmp,
    });
    server = await startServer(config, { roles: ["http", "worker"] });
  });

  afterAll(async () => {
    await server?.stop();
    await new Promise((r) => sink?.server.close(() => r(undefined)));
    await new Promise((r) => receiver?.server.close(r));
    await drop?.();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  /** A tiny cookie-keeping browser on the dashboard's origin. */
  const browser = () => {
    let cookie = "";
    return async (method: string, p: string, body?: unknown) => {
      const res = await fetch(base + p, {
        method,
        headers: {
          origin: base,
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set };
    };
  };

  const api = (key: string) => async (method: string, p: string, body?: unknown) => {
    const res = await fetch(base + p, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  const lastLinkTo = async (email: string) => {
    const m = await until(`mail to ${email}`, () => [...sink.mail].reverse().find((x) => x.to.includes(email)));
    return (await parseInbound(m.raw, { trustedAuthservIds: [] })).text.match(/https?:\/\/\S+/)![0];
  };

  it("walks from sign-up to a delivered webhook", async () => {
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    // The first person to sign up becomes the owner.
    const owner = browser();
    const signup = await owner("POST", "/auth/signup", { email: "owner@acme.dev", password: PASSWORD, name: "Owner" });
    expect(signup.status).toBe(201);
    expect(signup.setCookie).toMatch(/^send0_session=/);
    const link = await lastLinkTo("owner@acme.dev");
    expect(link.startsWith(`${base}/verify-email?token=`)).toBe(true);
    expect((await owner("POST", "/auth/verify-email", { token: new URL(link).searchParams.get("token") })).status).toBe(200);
    expect((await owner("POST", "/auth/workspace", { name: "Acme" })).status).toBe(200);
    expect((await owner("POST", "/auth/onboarding/finish")).status).toBe(200);

    // Then sign-up closes; others join by invite.
    const late = await browser()("POST", "/auth/signup", { email: "late@acme.dev", password: PASSWORD });
    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe("signup_closed");

    // The dashboard reaches the API through the in-process gateway.
    const inbox = await owner("POST", "/api/v1/inboxes", { name: "agent", send_policy: "open" });
    expect(inbox.status).toBe(201);
    expect(inbox.body.address).toBe(`agent@${MAIL_DOMAIN}`);
    const key = await owner("POST", "/api/v1/api-keys", { name: "ci", scopes: ["read", "send", "admin"] });
    expect(key.body.key).toMatch(/^s0_live_/);
    const call = api(key.body.key);

    // A webhook. The API only accepts public https URLs, so point the row at the local receiver directly.
    const hook = await call("POST", "/v1/webhooks", { url: "https://hooks.acme.dev/send0", events: ["message.sent"] });
    expect(hook.status).toBe(201);
    await server.services.db
      .update(schema.webhooks)
      .set({ url: `http://127.0.0.1:${receiver.port}/hook` })
      .where(eq(schema.webhooks.id, hook.body.id));

    // Real-time listeners, before the send: a long-poll for outbound mail and the org's SSE stream.
    const inboxHub = hubName.inbox(inbox.body.id);
    const waited = call("GET", `/v1/inboxes/${inbox.body.id}/messages/wait?direction=out&subject=Quarterly&timeout=20`);
    await until("the wait to reach the hub", () => server.services.hub.hasHub(inboxHub));
    const sse = new AbortController();
    const stream = await fetch(`${base}/v1/events/stream`, { headers: { authorization: `Bearer ${key.body.key}` }, signal: sse.signal });
    expect(stream.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = stream.body!.getReader();

    const started = Date.now();
    const sent = await call("POST", `/v1/inboxes/${inbox.body.id}/messages`, {
      to: "partner@example.com",
      subject: "Quarterly numbers",
      text: "Attached soon.",
    });
    expect(sent.status).toBe(201);

    // The relay got it, with our Message-ID on the mail domain.
    const out = await until("the relay to receive the send", () => sink.mail.find((m) => m.to.includes("partner@example.com")));
    expect(out.from).toBe(`agent@${MAIL_DOMAIN}`);
    expect(out.raw).toMatch(new RegExp(`^Message-ID: <msg_[A-Za-z0-9]+@${MAIL_DOMAIN.replace(/\./g, "\\.")}>`, "mi"));

    // The long-poll resolved through PgHub, well before its timeout.
    const w = await waited;
    expect(w.body).toMatchObject({ object: "wait_result", timed_out: false, message: { id: sent.body.id, direction: "out" } });
    expect(Date.now() - started).toBeLessThan(10_000);

    // So did the SSE stream.
    let text = "";
    const dec = new TextDecoder();
    await until("the SSE event", async () => {
      const { value } = await reader.read();
      text += dec.decode(value);
      return text.includes("event: message.sent") || undefined;
    });
    expect(text).toContain(sent.body.id);
    sse.abort();

    // The worker delivered a signed webhook.
    const delivered = await until("the webhook", () => receiver.hooks[0], 15_000);
    const envelope = JSON.parse(delivered.body);
    expect(envelope).toMatchObject({ type: "message.sent", data: { id: sent.body.id } });
    expect(await verifyWebhook(hook.body.secret, delivered.body, delivered.headers["send0-signature"] as string)).toBe(true);
  });

  it("serves the dashboard shell for client-side routes", async () => {
    const r = await fetch(`${base}/inboxes`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("send0 stub");
  });
});
