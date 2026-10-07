import { newApiKey, newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { eq, sql } from "drizzle-orm";
import { parse } from "jsonc-parser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKER_PATHS } from "../src/http";
import { createWorker, type WorkerOptions } from "../src/worker";
import { fakeCtx, fakeEnv, fakeMailer } from "./support";

const ORIGIN = "https://send0.acme.workers.dev";
const PASSWORD = "tangerine-orbit-42";

/** A raw message as Email Routing hands it to `email()`. */
function inboundMessage(to: string, raw: string) {
  const bytes = new TextEncoder().encode(raw);
  const rejected: string[] = [];
  return {
    rejected,
    message: {
      from: "alice@example.org",
      to,
      raw: new Response(bytes).body!,
      rawSize: bytes.byteLength,
      setReject: (reason: string) => void rejected.push(reason),
    } as unknown as ForwardableEmailMessage,
  };
}

/** A fresh Worker (its own isolate state), fake bindings and mailer over `db`. Every test builds its own. */
function harness(db: Db, vars: Record<string, string> = {}, opts: Omit<WorkerOptions, "createMailer"> = {}) {
  const createDb = vi.fn(() => db);
  const mail = fakeMailer();
  const worker = createWorker({ createDb, createMailer: mail.createMailer, ...opts });
  const fake = fakeEnv(vars);
  const call = async (path: string, init?: RequestInit, origin = ORIGIN) => {
    const { ctx, settle } = fakeCtx();
    const res = await worker.fetch(new Request(origin + path, init) as never, fake.env, ctx);
    await settle();
    return res;
  };
  return { worker, fake, mail, createDb, call };
}

/** A cookie-keeping browser on `origin`, for the dashboard's routes. */
function browser(call: ReturnType<typeof harness>["call"], origin = ORIGIN) {
  let cookie = "";
  return async (method: string, path: string, body?: unknown) => {
    const res = await call(
      path,
      {
        method,
        headers: { origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      origin,
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as any, setCookie: set };
  };
}

describe("the one-Worker edition", () => {
  let db: Db;
  let close: () => Promise<void>;
  let t: ReturnType<typeof harness>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());
  beforeEach(() => {
    t = harness(db);
  });

  it("serves /healthz, migrating and seeding the mail domains first", async () => {
    const res = await t.call("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const domains = await db.select().from(schema.domains).where(eq(schema.domains.name, "agents.acme.dev"));
    expect(domains.map((d) => [d.name, d.kind, d.status])).toEqual([["agents.acme.dev", "shared", "verified"]]);
    expect(t.createDb).toHaveBeenCalledWith("postgres://fake:fake@hyperdrive.local:5432/send0", expect.anything());
  });

  it("routes the API paths to the API", async () => {
    const inboxes = await t.call("/v1/inboxes");
    expect(inboxes.status).toBe(401);
    expect(((await inboxes.json()) as { error: { code: string } }).error.code).toBeDefined();
    const spec = await t.call("/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { openapi: string }).openapi).toBe("3.1.0");
    const mcp = await t.call("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(mcp.status).toBe(401);
    const internal = await t.call("/internal/ses-events?token=x", { method: "POST", body: "{}" });
    expect(internal.headers.get("content-type")).toMatch(/json/);
    expect(t.fake.assetRequests).toEqual([]);
  });

  it("routes /auth and /api to the dashboard", async () => {
    const instance = await t.call("/auth/instance");
    expect(((await instance.json()) as { mail_domains: string[] }).mail_domains).toEqual(["agents.acme.dev"]);
    const proxied = await t.call("/api/v1/inboxes");
    expect(proxied.status).toBe(401);
    expect(t.fake.assetRequests).toEqual([]);
  });

  it("serves everything else from the assets binding", async () => {
    for (const p of ["/", "/inboxes", "/assets/app-abc.js", "/healthzz"]) {
      const res = await t.call(p);
      expect(await res.text()).toBe(`asset ${p}`);
    }
    expect(t.fake.assetRequests).toEqual(["/", "/inboxes", "/assets/app-abc.js", "/healthzz"]);
  });

  it("lists in wrangler.jsonc every path it runs for", () => {
    const cfg = parse(readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href), "utf8")) as {
      assets: { run_worker_first: string[] };
    };
    expect([...cfg.assets.run_worker_first].sort()).toEqual([...WORKER_PATHS].sort());
  });

  it("receives mail, stores it in R2 and serves it back through a signed /v1/files link", async () => {
    const orgId = newId("org");
    await db.insert(schema.orgs).values({ id: orgId, name: "Acme" });
    const k = await newApiKey("live");
    await db
      .insert(schema.apiKeys)
      .values({ id: newId("key"), orgId, name: "t", prefix: k.prefix, hash: k.hash, mode: "live", scopes: ["admin"] });
    const auth = { authorization: `Bearer ${k.key}`, "content-type": "application/json" };
    const name = `agent-${orgId.slice(-6).toLowerCase()}`;
    const created = await t.call("/v1/inboxes", { method: "POST", headers: auth, body: JSON.stringify({ name }) });
    expect(created.status).toBe(201);
    const inbox = (await created.json()) as { id: string; address: string };
    expect(inbox.address).toBe(`${name}@agents.acme.dev`);

    const raw = [
      "From: Alice <alice@example.org>",
      `To: ${inbox.address}`,
      "Subject: Your code",
      `Message-ID: <otp-${orgId}@example.org>`,
      "Date: Wed, 07 Oct 2026 10:00:00 +0000",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Your verification code is 482913.",
      "",
    ].join("\r\n");
    const { message, rejected } = inboundMessage(inbox.address, raw);
    await t.worker.email(message, t.fake.env);
    expect(rejected).toEqual([]);
    expect(t.fake.sent).toEqual([{ kind: "fanout", eventId: expect.stringMatching(/^evt_/) }]);
    expect(t.fake.notified.map((n) => n.name).sort()).toEqual([`inbox:${inbox.id}`, `org:${orgId}`]);

    const list = (await (await t.call(`/v1/inboxes/${inbox.id}/messages`, { headers: auth })).json()) as { data: { id: string }[] };
    const id = list.data[0]!.id;
    const redirect = await t.call(`/v1/messages/${id}/raw`, { headers: auth, redirect: "manual" });
    expect(redirect.status).toBe(302);
    const link = redirect.headers.get("location")!;
    expect(link.startsWith(`${ORIGIN}/v1/files/`)).toBe(true);
    const file = await t.call(new URL(link).pathname);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe(raw);
  });

  it("refuses mail for unknown inboxes while the session is open", async () => {
    const { message, rejected } = inboundMessage("nobody@agents.acme.dev", "Subject: hi\r\n\r\nhi\r\n");
    await t.worker.email(message, t.fake.env);
    expect(rejected).toEqual(["5.1.1 Mailbox does not exist"]);
  });
});

describe("the dashboard", () => {
  let db: Db;
  let close: () => Promise<void>;
  // Each test signs up the install's owner, so each gets its own database.
  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    return () => close();
  });

  it("trusts the request's own origin when PUBLIC_URL is unset", async () => {
    const t = harness(db);
    const otherHost = "https://mail.acme.dev";
    const crossSite = await t.call("/auth/login", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }, otherHost);
    expect(crossSite.status).toBe(403);
    const signup = await browser(t.call, otherHost)("POST", "/auth/signup", { email: "owner@acme.dev", password: PASSWORD });
    expect(signup.status).toBe(201);
    expect(signup.setCookie).toMatch(/Secure/);
    // The owner verifies through SES, from the default system address, with a link on this origin.
    expect(t.mail.sent.map((m) => [m.from, m.recipients])).toEqual([["noreply@agents.acme.dev", ["owner@acme.dev"]]]);
    expect(t.mail.sent[0]!.raw).toContain(`${otherHost}/verify-email?token=`);
  });

  it("runs /api through the in-process gateway as the signed-in member's workspace", async () => {
    const t = harness(db);
    const owner = browser(t.call);
    expect((await owner("POST", "/auth/signup", { email: "owner@acme.dev", password: PASSWORD })).status).toBe(201);
    await db
      .update(schema.users)
      .set({ emailVerifiedAt: new Date() })
      .where(sql`lower(${schema.users.email}) = 'owner@acme.dev'`);
    expect((await owner("POST", "/auth/workspace", { name: "Acme" })).status).toBe(200);
    const me = await owner("GET", "/auth/me");
    const workspaceId = me.body.workspace.id as string;

    const created = await owner("POST", "/api/v1/inboxes", { name: "agent" });
    expect(created.status).toBe(201);
    expect(created.body.address).toBe("agent@agents.acme.dev");
    const [row] = await db.select().from(schema.inboxes).where(eq(schema.inboxes.id, created.body.id));
    expect(row?.orgId).toBe(workspaceId);
    const listed = await owner("GET", "/api/v1/inboxes");
    expect(listed.body.data.map((i: { id: string }) => i.id)).toEqual([created.body.id]);
  });
});

describe("the canonical URL", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it("redirects other hostnames to PUBLIC_URL before doing any work", async () => {
    const t = harness(db, { PUBLIC_URL: "https://mail.acme.dev" });
    const res = await t.call("/v1/inboxes?limit=5", { method: "POST", body: "{}", redirect: "manual" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://mail.acme.dev/v1/inboxes?limit=5");
    expect(t.createDb).not.toHaveBeenCalled();
    const there = await t.call("/healthz", undefined, "https://mail.acme.dev");
    expect(there.status).toBe(200);
  });

  it("upgrades plain http to https, except on localhost", async () => {
    const t = harness(db);
    const res = await t.call("/healthz", undefined, "http://send0.acme.workers.dev");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://send0.acme.workers.dev/healthz");
    expect((await t.call("/healthz", undefined, "http://localhost:8787")).status).toBe(200);
  });

  it("signs download links and dashboard links with PUBLIC_URL", async () => {
    const t = harness(db, { PUBLIC_URL: "https://mail.acme.dev" });
    const instance = await t.call("/auth/instance", undefined, "https://mail.acme.dev");
    expect(instance.status).toBe(200);
    const crossOrigin = await t.call(
      "/auth/login",
      { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" },
      "https://mail.acme.dev",
    );
    expect(crossOrigin.status).toBe(403);
  });
});

describe("boot", () => {
  /** `db`, except that its first `transaction` call (the first boot) fails or hangs as `mode` says. */
  function brokenFirst(db: Db, mode: "reject" | "hang") {
    let calls = 0;
    const proxy = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return (...args: unknown[]) => {
            if (++calls === 1) return mode === "reject" ? Promise.reject(new Error("connect ECONNREFUSED")) : new Promise(() => {});
            return (target.transaction as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    return { db: proxy, calls: () => calls };
  }

  it("answers 503 while the database is unreachable, then boots on the next request", async () => {
    const { db, close } = await createTestDb();
    const broken = brokenFirst(db, "reject");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = harness(broken.db);
    expect((await t.call("/healthz")).status).toBe(503);
    expect(broken.calls()).toBe(1);
    const [a, b] = await Promise.all([t.call("/healthz"), t.call("/healthz")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const calls = broken.calls();
    await t.call("/healthz");
    expect(broken.calls()).toBe(calls); // booted: no more migration transactions
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({ event: "boot.failed" });
    error.mockRestore();
    await close();
  });

  it("doesn't let a hanging first boot block the next invocation", async () => {
    const { db, close } = await createTestDb();
    const broken = brokenFirst(db, "hang");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = harness(broken.db, {}, { bootTimeoutMs: 300 });
    const first = t.call("/healthz");
    const second = await t.call("/healthz");
    expect(second.status).toBe(200);
    const stuck = await first;
    expect(stuck.status).toBe(503);
    expect(stuck.headers.get("retry-after")).toBe("5");
    expect(((await stuck.json()) as { error: { code: string } }).error.code).toBe("starting_up");
    error.mockRestore();
    await close();
  });

  it("throws from email, queue and cron when boot hangs", async () => {
    const { db, close } = await createTestDb();
    const t = harness(
      new Proxy(db, { get: (target, prop) => (prop === "transaction" ? () => new Promise(() => {}) : Reflect.get(target, prop)) }),
      {},
      {
        bootTimeoutMs: 50,
      },
    );
    await expect(t.worker.scheduled({} as ScheduledController, t.fake.env)).rejects.toThrow(/starting up/);
    const { message } = inboundMessage("agent@agents.acme.dev", "Subject: hi\r\n\r\nhi\r\n");
    await expect(t.worker.email(message, t.fake.env)).rejects.toThrow(/starting up/);
    await close();
  });

  it("shows the config error page on every Worker route without touching the database", async () => {
    const createDb = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = createWorker({ createDb });
    const { env } = fakeEnv({ SECRET_KEY: "hunter2", OWNER_EMAIL: "" });
    // `/` and other SPA paths never reach the Worker (run_worker_first); the SPA shows this page's
    // text when /auth/instance answers with it.
    for (const p of ["/healthz", "/auth/instance", "/v1/inboxes"]) {
      const res = await worker.fetch(new Request(ORIGIN + p) as never, env, fakeCtx().ctx);
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
      const text = await res.text();
      expect(text).toContain("SECRET_KEY: must be at least 32 characters");
      expect(text).toContain("OWNER_EMAIL: is required");
      expect(text).not.toContain("hunter2");
    }
    expect(createDb).not.toHaveBeenCalled();
    await expect(worker.scheduled({} as ScheduledController, env)).rejects.toThrow("send0 is misconfigured: SECRET_KEY, OWNER_EMAIL");
    error.mockRestore();
  });
});
