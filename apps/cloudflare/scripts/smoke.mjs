#!/usr/bin/env node
/**
 * Local end-to-end smoke test for the one-Worker edition, under `wrangler dev --local` (Miniflare
 * provides R2, Queues, Durable Objects, and Hyperdrive via wrangler.jsonc's localConnectionString).
 *
 *   pnpm --filter @send0/cloudflare smoke
 *
 * Needs Docker, or a Postgres on 127.0.0.1:55432 (user postgres, password send0). The database
 * send0_cf_dev is dropped and recreated on every run. Set SMOKE_ADMIN_URL to use another server's
 * admin database; the Worker always uses localConnectionString.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO = path.resolve(APP_DIR, "../..");
const WEB_INDEX = path.join(REPO, "apps/web/dist/client/index.html");
const ADMIN_URL = process.env.SMOKE_ADMIN_URL ?? "postgres://postgres:send0@127.0.0.1:55432/postgres";
const DB_NAME = "send0_cf_dev";
const MAIL_DOMAIN = "agents.acme.dev";
const OWNER = "owner@acme.dev";
const PASSWORD = "tangerine-orbit-42";
const OTP = "482913";

const step = (msg) => console.log(`\n▸ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg, extra) {
  if (!cond)
    throw new Error(`${msg}${extra === undefined ? "" : `\n${typeof extra === "string" ? extra : JSON.stringify(extra, null, 2)}`}`);
}

/** Polls `fn` until it returns something truthy, or fails after `ms`. */
async function until(what, fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(250);
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** The SPA must be built for the assets binding. */
function ensureWebBuild() {
  if (existsSync(WEB_INDEX)) return ok("dashboard already built");
  const r = spawnSync("pnpm", ["--filter", "@send0/web", "build"], { cwd: REPO, stdio: "inherit" });
  assert(r.status === 0, "building the dashboard failed");
  ok("dashboard built");
}

/** Makes sure Postgres answers (starting the Docker container if needed), then recreates the dev database. */
async function resetDatabase() {
  const ping = async () => {
    const sql = postgres(ADMIN_URL, { max: 1, connect_timeout: 3, onnotice: () => {} });
    try {
      await sql`select 1`;
      return true;
    } finally {
      await sql.end();
    }
  };
  if (!(await ping().catch(() => false))) {
    if (process.env.SMOKE_ADMIN_URL) throw new Error("SMOKE_ADMIN_URL is unreachable");
    console.log("  starting Postgres in Docker (send0-test-pg)");
    const started = spawnSync("docker", ["start", "send0-test-pg"], { stdio: "ignore" });
    if (started.status !== 0) {
      const run = spawnSync(
        "docker",
        ["run", "-d", "--name", "send0-test-pg", "-e", "POSTGRES_PASSWORD=send0", "-p", "127.0.0.1:55432:5432", "postgres:17-alpine"],
        { stdio: "inherit" },
      );
      assert(run.status === 0, "couldn't start Postgres in Docker");
    }
    await until("Postgres", ping, 60_000);
  }
  const sql = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    await sql.unsafe(`CREATE DATABASE "${DB_NAME}"`);
  } finally {
    await sql.end();
  }
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  ok(`fresh database ${DB_NAME}`);
  return url.toString();
}

/** A webhook endpoint that records every POST. */
async function startReceiver() {
  const hooks = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hooks.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port, hooks };
}

/** Runs `wrangler dev --local` with test settings from a temporary env file and state directory. */
async function startWrangler(tmp, port) {
  // Test values only. The SES keys are fake, so the verification email fails to send (the step below
  // marks the owner verified directly in the database instead).
  const envFile = path.join(tmp, "smoke.dev.vars");
  await writeFile(
    envFile,
    [
      `SECRET_KEY=${randomBytes(32).toString("hex")}`,
      `OWNER_EMAIL=${OWNER}`,
      `MAIL_DOMAINS=${MAIL_DOMAIN}`,
      "SES_ACCESS_KEY_ID=AKIAFAKESMOKETEST000",
      "SES_SECRET_ACCESS_KEY=fake-secret-for-the-smoke-test",
      `MAIL_FROM=noreply@${MAIL_DOMAIN}`,
      "",
    ].join("\n"),
  );
  const bin = path.join(APP_DIR, "node_modules/.bin/wrangler");
  const args = ["dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--env-file", envFile];
  args.push("--persist-to", path.join(tmp, "state"), "--show-interactive-dev-session=false", "--log-level", "info");
  const child = spawn(bin, args, { cwd: APP_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const stop = async () => {
    if (child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await Promise.race([new Promise((r) => child.once("exit", r)), sleep(5_000)]);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  };
  return { child, stop, output: () => output };
}

/** A tiny cookie-keeping browser on the dashboard's origin. */
function browser(base) {
  let cookie = "";
  return async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, body: json, text };
  };
}

const apiClient = (base, key) => async (method, p, body) => {
  const res = await fetch(base + p, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
};

/** The response of a stateless MCP request, which may come back as JSON or as one SSE event. */
async function mcpCall(base, key, id, method, params = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  assert(res.ok, `MCP ${method} failed with ${res.status}`, text);
  const data = text.startsWith("{")
    ? text
    : text
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5);
  return JSON.parse(data);
}

function verifySignature(secret, body, header) {
  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((p) => p.trim().split("=")),
  );
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  return parts.v1 === expected;
}

async function walk(base, dbUrl, receiver) {
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  try {
    step("1. healthz");
    const health = await fetch(`${base}/healthz`);
    assert(health.status === 200, `healthz returned ${health.status}`, await health.text());
    ok("healthy, migrated and seeded");
    const [domain] = await sql`select name, kind, status from domains where name = ${MAIL_DOMAIN}`;
    assert(domain?.kind === "shared" && domain?.status === "verified", "mail domain not seeded", domain);
    ok(`${MAIL_DOMAIN} is a verified shared domain`);

    step("2. owner sign-up");
    const squatter = await browser(base)("POST", "/auth/signup", { email: "squatter@acme.dev", password: PASSWORD });
    assert(squatter.status === 403, "sign-up should be closed to everyone but the owner", squatter.body);
    const owner = browser(base);
    const signup = await owner("POST", "/auth/signup", { email: OWNER, password: PASSWORD, name: "Owner" });
    assert(signup.status === 201, `sign-up returned ${signup.status}`, signup.body);
    ok("owner signed up");
    // The SES keys are fake, so the verification email never leaves. Verify the owner directly instead.
    await sql`update users set email_verified_at = now() where lower(email) = ${OWNER}`;
    ok("owner marked verified in the database (no real SES in the smoke test)");

    step("3. workspace and onboarding");
    const ws = await owner("POST", "/auth/workspace", { name: "Acme" });
    assert(ws.status === 200, `workspace returned ${ws.status}`, ws.body);
    const fin = await owner("POST", "/auth/onboarding/finish");
    assert(fin.status === 200, `onboarding returned ${fin.status}`, fin.body);
    ok("workspace Acme, onboarding finished");

    step("4. inbox and API key through /api");
    const inbox = await owner("POST", "/api/v1/inboxes", { name: "agent", send_policy: "open" });
    assert(inbox.status === 201, `inbox returned ${inbox.status}`, inbox.body);
    assert(inbox.body.address === `agent@${MAIL_DOMAIN}`, "unexpected address", inbox.body);
    const key = await owner("POST", "/api/v1/api-keys", { name: "smoke", scopes: ["read", "send", "admin"] });
    assert(key.status === 201 && /^s0_live_/.test(key.body?.key), "API key not created", key.body);
    const call = apiClient(base, key.body.key);
    ok(`${inbox.body.address} (${inbox.body.id}) and a live key`);

    // A webhook. The API only accepts public https URLs, so point the row at the local receiver directly.
    const hook = await call("POST", "/v1/webhooks", { url: "https://hooks.acme.dev/send0", events: ["message.received"] });
    assert(hook.status === 201, `webhook returned ${hook.status}`, hook.body);
    await sql`update webhooks set url = ${`http://127.0.0.1:${receiver.port}/hook`} where id = ${hook.body.id}`;
    ok("webhook registered and repointed at the local receiver");

    // Listeners before the mail arrives: a long-poll and the org's SSE stream.
    const waited = call("GET", `/v1/inboxes/${inbox.body.id}/messages/wait?subject=verification&timeout=25`);
    const sse = new AbortController();
    const stream = await fetch(`${base}/v1/events/stream`, { headers: { authorization: `Bearer ${key.body.key}` }, signal: sse.signal });
    assert(/text\/event-stream/.test(stream.headers.get("content-type") ?? ""), "SSE stream has the wrong content type");
    const reader = stream.body.getReader();
    await sleep(500);

    step("5. inbound email through wrangler's local email endpoint");
    const raw = [
      "From: Alice <alice@example.org>",
      `To: ${inbox.body.address}`,
      "Subject: Your verification code",
      `Message-ID: <smoke-${Date.now()}@example.org>`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      `Your verification code is ${OTP}. It expires in 10 minutes.`,
      "",
    ].join("\r\n");
    const params = new URLSearchParams({ from: "alice@example.org", to: inbox.body.address });
    const delivered = await fetch(`${base}/cdn-cgi/local/email?${params}`, { method: "POST", body: raw });
    const deliveredText = await delivered.text();
    assert(delivered.ok, `local email endpoint returned ${delivered.status}`, deliveredText);
    ok(`delivered (${deliveredText.trim().slice(0, 80)})`);

    step("6. wait returns it with the OTP");
    const w = await waited;
    assert(w.status === 200 && w.body?.timed_out === false, "wait didn't return the message", w.body);
    assert(w.body.message.extracted?.otp === OTP, "OTP not extracted", w.body.message);
    ok(`message ${w.body.message.id}, otp ${w.body.message.extracted.otp}`);
    const messageId = w.body.message.id;

    step("7. SSE stream gets the event");
    let text = "";
    const dec = new TextDecoder();
    await until("the SSE event", async () => {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      text += dec.decode(value);
      return text.includes("event: message.received") || undefined;
    });
    assert(text.includes(messageId), "SSE event doesn't name the message", text);
    sse.abort();
    ok("event: message.received");

    step("8. /raw redirects to a signed /v1/files link served from local R2");
    const r = await call("GET", `/v1/messages/${messageId}/raw`);
    assert(r.status === 302, `raw returned ${r.status}`, r.text);
    const link = r.headers.get("location");
    assert(link?.startsWith(`${base}/v1/files/`), "unexpected download link", link);
    const file = await fetch(link);
    const bytes = await file.text();
    assert(file.status === 200 && bytes === raw, "downloaded bytes differ from what was delivered", { status: file.status, bytes });
    ok(`${bytes.length} bytes match`);

    step("9. /mcp tools/list");
    const listed = await mcpCall(base, key.body.key, 1, "tools/list");
    const names = listed.result?.tools?.map((t) => t.name) ?? [];
    assert(names.includes("wait_for_email") && names.includes("send_email"), "MCP tools missing", listed);
    ok(names.join(", "));

    step("10. signed webhook through the local queue consumer");
    const hookCall = await until("the webhook delivery", async () => receiver.hooks[0], 30_000);
    const envelope = JSON.parse(hookCall.body);
    assert(envelope.type === "message.received" && envelope.data?.id === messageId, "unexpected webhook payload", envelope);
    assert(
      verifySignature(hook.body.secret, hookCall.body, hookCall.headers["send0-signature"]),
      "bad webhook signature",
      hookCall.headers,
    );
    ok(`${envelope.type} for ${envelope.data.id}, signature valid`);
  } finally {
    await sql.end();
  }
}

async function main() {
  step("setup");
  ensureWebBuild();
  const dbUrl = await resetDatabase();
  const receiver = await startReceiver();
  const tmp = await mkdtemp(path.join(tmpdir(), "send0-cf-smoke-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const wrangler = await startWrangler(tmp, port);
  let failed = false;
  try {
    await until(
      "wrangler dev",
      async () => {
        if (wrangler.child.exitCode !== null) throw new Error("wrangler dev exited");
        const r = await fetch(`${base}/healthz`);
        return r.status === 200;
      },
      90_000,
    ).catch((err) => {
      if (wrangler.child.exitCode !== null) throw new Error("wrangler dev exited early");
      throw err;
    });
    ok(`wrangler dev on ${base}`);
    await walk(base, dbUrl, receiver);
    console.log("\nsmoke test passed");
  } catch (err) {
    failed = true;
    console.error(`\nsmoke test FAILED: ${err.message}`);
    console.error("\n--- wrangler output (tail) ---\n" + wrangler.output().split("\n").slice(-80).join("\n"));
  } finally {
    await wrangler.stop();
    await new Promise((r) => receiver.server.close(r));
    await rm(tmp, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

await main();
