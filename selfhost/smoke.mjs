// Smoke-tests the self-hosted Docker setup end to end: sign-up, inbound mail, wait, reply, MCP and doctor.
// Plain Node 22, no dependencies. Run from the repo root:
//
//   node selfhost/smoke.mjs all    build and start the stack, test it, then tear it down (pnpm smoke:selfhost)
//   node selfhost/smoke.mjs up     build and start the stack
//   node selfhost/smoke.mjs test   test a running stack
//   node selfhost/smoke.mjs logs   print the stack's logs
//   node selfhost/smoke.mjs down   stop the stack and delete its volumes
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:8025";
const SMTP = { host: "127.0.0.1", port: 2525 };
const MAIL_DOMAIN = "agents.smoke.test";
const OWNER = "owner@smoke.test";
const PASSWORD = "smoke-test-password-1234";
const OTP = "482913";

const here = fileURLToPath(new URL(".", import.meta.url));
// The stack's own project name, so a smoke run never touches a real install on the same machine.
const COMPOSE = ["compose", "-p", "send0-smoke", "-f", `${here}compose.yml`, "-f", `${here}compose.smoke.yml`];
// compose.yml requires these for interpolation; the smoke override supplies everything else.
const COMPOSE_ENV = { ...process.env, POSTGRES_PASSWORD: "smoke", DOMAIN: "localhost" };

function compose(args, opts = {}) {
  const r = spawnSync("docker", [...COMPOSE, ...args], { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", env: COMPOSE_ENV });
  if (r.error) throw r.error;
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, check, ms = 60_000) {
  const deadline = Date.now() + ms;
  let last;
  for (;;) {
    try {
      const v = await check();
      if (v !== undefined && v !== false && v !== null) return v;
    } catch (err) {
      last = err;
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ""}`);
    await sleep(500);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** A cookie-keeping browser on the dashboard's origin. */
function browser() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        origin: BASE,
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
    return json;
  };
}

/** The public API with a bearer key. */
const api = (key) => async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "idempotency-key": randomBytes(8).toString("hex") } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

async function mailpit(path) {
  const res = await fetch(MAILPIT + path);
  if (!res.ok) throw new Error(`Mailpit ${path} answered ${res.status}`);
  return res.json();
}

/** The newest message Mailpit holds for `to` that passes `match`, polled until it arrives. */
const mailTo = (to, match = () => true) =>
  until(`mail to ${to}`, async () => {
    const { messages } = await mailpit(`/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    return messages.find(match);
  });

/** Sends one message over plain SMTP, speaking the protocol directly. */
function sendSmtp({ from, to, data }) {
  return new Promise((resolve, reject) => {
    const socket = connect(SMTP);
    socket.setTimeout(30_000, () => socket.destroy(new Error("SMTP timed out")));
    const steps = [
      [220, () => `EHLO smoke.test`],
      [250, () => `MAIL FROM:<${from}>`],
      [250, () => `RCPT TO:<${to}>`],
      [250, () => "DATA"],
      [354, () => `${data.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..")}\r\n.`],
      [250, () => "QUIT"],
      [221, null],
    ];
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      buf += chunk;
      // A reply is complete at a line with a space after the code ("250 ok", not "250-…").
      for (let m; (m = /^(\d{3}) .*\r?\n/m.exec(buf));) {
        const reply = buf.slice(0, m.index + m[0].length);
        buf = buf.slice(m.index + m[0].length);
        const [want, next] = steps.shift();
        if (Number(m[1]) !== want) return socket.destroy(new Error(`SMTP expected ${want}, got: ${reply.trim()}`));
        if (!next) return socket.end(resolve);
        socket.write(`${next()}\r\n`);
      }
    });
  });
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    console.log(`ok   ${name}${detail ? ` (${detail})` : ""} [${Date.now() - started}ms]`);
  } catch (err) {
    console.log(`FAIL ${name}: ${err.message}`);
    throw err;
  }
}

async function test() {
  const owner = browser();
  let inbox, key, received;

  await step("healthz", () =>
    until("GET /healthz", async () => (await fetch(`${BASE}/healthz`)).ok, 120_000).then(() => "the server is up"),
  );

  await step("owner signs up, verifies and onboards", async () => {
    await owner("POST", "/auth/signup", { email: OWNER, password: PASSWORD, name: "Smoke" });
    const mail = await mailTo(OWNER, (m) => /confirm your email/i.test(m.Subject));
    const { Text } = await mailpit(`/api/v1/message/${mail.ID}`);
    const link = Text.match(/https?:\/\/\S+\/verify-email\?token=\S+/)?.[0];
    assert(link, "no verification link in the email");
    await owner("POST", "/auth/verify-email", { token: new URL(link).searchParams.get("token") });
    await owner("POST", "/auth/workspace", { name: "Smoke" });
    await owner("POST", "/auth/onboarding/finish");
    return OWNER;
  });

  await step("create an inbox and an API key through the dashboard session", async () => {
    inbox = await owner("POST", "/api/v1/inboxes", { name: "agent", send_policy: "open" });
    assert(inbox.address === `agent@${MAIL_DOMAIN}`, `unexpected address ${inbox.address}`);
    const created = await owner("POST", "/api/v1/api-keys", { name: "smoke", scopes: ["read", "send", "admin"] });
    key = created.key;
    assert(/^s0_live_/.test(key), "no live API key returned");
    return inbox.address;
  });
  const call = api(key);

  const messageId = `<smoke-${randomBytes(6).toString("hex")}@smoke.test>`;
  const waited = call("GET", `/v1/inboxes/${inbox.id}/messages/wait?timeout=30`);

  await step("deliver an OTP email over SMTP", async () => {
    await sendSmtp({
      from: "sender@smoke.test",
      to: inbox.address,
      data: [
        "From: Sender <sender@smoke.test>",
        `To: ${inbox.address}`,
        "Subject: Your verification code",
        `Message-ID: ${messageId}`,
        `Date: ${new Date().toUTCString()}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        `Your code is ${OTP}`,
        "",
      ].join("\n"),
    });
    return `${SMTP.host}:${SMTP.port}`;
  });

  await step("wait returns it with the OTP extracted", async () => {
    const r = await waited;
    assert(!r.timed_out && r.message, `wait timed out: ${JSON.stringify(r)}`);
    received = r.message;
    assert(received.extracted?.otp === OTP, `extracted.otp is ${received.extracted?.otp}`);
    assert(received.rfc_message_id === messageId, `rfc_message_id is ${received.rfc_message_id}`);
    return `otp ${received.extracted.otp}`;
  });

  await step("reply, and the relay gets In-Reply-To", async () => {
    await call("POST", `/v1/messages/${received.id}/reply`, { text: "Thanks, got it." });
    const mail = await mailTo("sender@smoke.test", (m) => /verification code/i.test(m.Subject));
    const headers = await mailpit(`/api/v1/message/${mail.ID}/headers`);
    const inReplyTo = headers["In-Reply-To"]?.[0];
    assert(inReplyTo === messageId, `In-Reply-To is ${inReplyTo}, want ${messageId}`);
    return `In-Reply-To ${inReplyTo}`;
  });

  await step("MCP lists wait_for_email", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const text = await res.text();
    assert(res.ok, `POST /mcp answered ${res.status}: ${text.slice(0, 300)}`);
    // The response is JSON or a one-event SSE stream.
    const json = JSON.parse(text.trim().startsWith("{") ? text : text.match(/^data: (.*)$/m)[1]);
    const names = json.result.tools.map((t) => t.name);
    assert(names.includes("wait_for_email"), `tools are ${names.join(", ")}`);
    return `${names.length} tools`;
  });

  await step("send0 doctor runs inside the container", async () => {
    const r = compose(["exec", "-T", "send0", "send0", "doctor"], { capture: true });
    process.stdout.write(r.stdout.replace(/^(?=.)/gm, "     | "));
    // Exit 1 is fine here: the smoke mail domain has no MX. Anything else, or no summary, is a crash.
    assert(r.status === 0 || r.status === 1, `doctor exited ${r.status}: ${r.stderr}`);
    assert(/^\d+ ok, \d+ warning\(s\), \d+ failed$/m.test(r.stdout), "doctor printed no summary");
    assert(/^✓ database/m.test(r.stdout) && /^✓ mailer/m.test(r.stdout), "doctor says the database or mailer is broken");
    return `exit ${r.status}`;
  });
}

async function main(cmd) {
  switch (cmd) {
    case "up":
      return compose(["up", "-d", "--build"]).status ?? 1;
    case "down":
      return compose(["down", "-v", "--remove-orphans"]).status ?? 1;
    case "logs":
      return compose(["logs", "--no-color", "--timestamps"]).status ?? 1;
    case "test":
      try {
        await test();
      } catch {
        return 1;
      }
      console.log("smoke test passed");
      return 0;
    case "all":
      try {
        const up = await main("up");
        if (up !== 0) return up;
        const code = await main("test");
        if (code !== 0) await main("logs");
        return code;
      } finally {
        await main("down");
      }
    default:
      console.error("Usage: node selfhost/smoke.mjs all|up|test|logs|down");
      return 2;
  }
}

process.exitCode = await main(process.argv[2] ?? "all");
