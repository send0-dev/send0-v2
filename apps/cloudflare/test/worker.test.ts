import { newApiKey, newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { parse } from "jsonc-parser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WORKER_PATHS } from "../src/http";
import { createWorker } from "../src/worker";
import { fakeCtx, fakeEnv, fakeMailer } from "./support";

const ORIGIN = "https://send0.acme.workers.dev";

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

describe("the one-Worker edition", () => {
  let db: Db;
  let close: () => Promise<void>;
  const createDb = vi.fn(() => db);
  const mail = fakeMailer();
  const worker = createWorker({ createDb, createMailer: mail.createMailer });
  const fake = fakeEnv();

  const call = async (path: string, init?: RequestInit, origin = ORIGIN) => {
    const { ctx, settle } = fakeCtx();
    const res = await worker.fetch(new Request(origin + path, init) as never, fake.env, ctx);
    await settle();
    return res;
  };

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it("serves /healthz, migrating and seeding the mail domains first", async () => {
    const res = await call("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const domains = await db.select().from(schema.domains);
    expect(domains.map((d) => [d.name, d.kind, d.status])).toEqual([["agents.acme.dev", "shared", "verified"]]);
    expect(createDb).toHaveBeenCalledWith("postgres://fake:fake@hyperdrive.local:5432/send0", expect.anything());
  });

  it("routes the API paths to the API", async () => {
    const inboxes = await call("/v1/inboxes");
    expect(inboxes.status).toBe(401);
    expect(((await inboxes.json()) as { error: { code: string } }).error.code).toBeDefined();
    const spec = await call("/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as { openapi: string }).openapi).toBe("3.1.0");
    const mcp = await call("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(mcp.status).toBe(401);
    const internal = await call("/internal/ses-events?token=x", { method: "POST", body: "{}" });
    expect(internal.headers.get("content-type")).toMatch(/json/);
    expect(fake.assetRequests).toEqual([]);
  });

  it("routes /auth and /api to the dashboard", async () => {
    const instance = await call("/auth/instance");
    expect(await instance.json()).toEqual({ mail_domains: ["agents.acme.dev"], signup_open: true });
    const proxied = await call("/api/v1/inboxes");
    expect(proxied.status).toBe(401);
    expect(fake.assetRequests).toEqual([]);
  });

  it("serves everything else from the assets binding", async () => {
    for (const p of ["/", "/inboxes", "/assets/app-abc.js", "/healthzz"]) {
      const res = await call(p);
      expect(await res.text()).toBe(`asset ${p}`);
    }
    expect(fake.assetRequests).toEqual(["/", "/inboxes", "/assets/app-abc.js", "/healthzz"]);
  });

  it("lists in wrangler.jsonc every path it runs for", async () => {
    const cfg = parse(readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href), "utf8")) as {
      assets: { run_worker_first: string[] };
    };
    expect([...cfg.assets.run_worker_first].sort()).toEqual([...WORKER_PATHS].sort());
  });

  it("trusts the request's own origin when PUBLIC_URL is unset", async () => {
    const otherHost = "https://mail.acme.dev";
    const crossSite = await call("/auth/login", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }, otherHost);
    expect(crossSite.status).toBe(403);
    const sameSite = await call(
      "/auth/signup",
      {
        method: "POST",
        headers: { origin: otherHost, "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@acme.dev", password: "tangerine-orbit-42" }),
      },
      otherHost,
    );
    expect(sameSite.status).toBe(201);
    expect(sameSite.headers.get("set-cookie")).toMatch(/Secure/);
    // The owner verifies through SES, from the default system address.
    expect(mail.sent.map((m) => [m.from, m.recipients])).toEqual([["noreply@agents.acme.dev", ["owner@acme.dev"]]]);
  });

  it("receives mail, stores it in R2 and serves it back through a signed /v1/files link", async () => {
    const orgId = newId("org");
    await db.insert(schema.orgs).values({ id: orgId, name: "Acme" });
    const k = await newApiKey("live");
    await db
      .insert(schema.apiKeys)
      .values({ id: newId("key"), orgId, name: "t", prefix: k.prefix, hash: k.hash, mode: "live", scopes: ["admin"] });
    const auth = { authorization: `Bearer ${k.key}`, "content-type": "application/json" };
    const created = await call("/v1/inboxes", { method: "POST", headers: auth, body: JSON.stringify({ name: "agent" }) });
    expect(created.status).toBe(201);
    const inbox = (await created.json()) as { id: string; address: string };
    expect(inbox.address).toBe("agent@agents.acme.dev");

    const raw = [
      "From: Alice <alice@example.org>",
      `To: ${inbox.address}`,
      "Subject: Your code",
      "Message-ID: <otp-1@example.org>",
      "Date: Wed, 07 Oct 2026 10:00:00 +0000",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Your verification code is 482913.",
      "",
    ].join("\r\n");
    const { message, rejected } = inboundMessage(inbox.address, raw);
    await worker.email(message, fake.env);
    expect(rejected).toEqual([]);
    expect(fake.sent).toEqual([{ kind: "fanout", eventId: expect.stringMatching(/^evt_/) }]);
    expect(fake.notified.map((n) => n.name).sort()).toEqual([`inbox:${inbox.id}`, `org:${orgId}`]);

    const list = (await (await call(`/v1/inboxes/${inbox.id}/messages`, { headers: auth })).json()) as { data: { id: string }[] };
    const id = list.data[0]!.id;
    const redirect = await call(`/v1/messages/${id}/raw`, { headers: auth, redirect: "manual" });
    expect(redirect.status).toBe(302);
    const link = redirect.headers.get("location")!;
    expect(link.startsWith(`${ORIGIN}/v1/files/`)).toBe(true);
    const file = await call(new URL(link).pathname);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe(raw);
  });

  it("refuses mail for unknown inboxes while the session is open", async () => {
    const { message, rejected } = inboundMessage("nobody@agents.acme.dev", "Subject: hi\r\n\r\nhi\r\n");
    await worker.email(message, fake.env);
    expect(rejected).toEqual(["5.1.1 Mailbox does not exist"]);
  });
});

describe("boot", () => {
  it("answers 503 while the database is unreachable, then retries on the next request", async () => {
    const { db, close } = await createTestDb();
    let up = false;
    let boots = 0;
    const flaky = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return (...args: unknown[]) => {
            boots++;
            if (!up) return Promise.reject(new Error("connect ECONNREFUSED"));
            return (target.transaction as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = createWorker({ createDb: () => flaky });
    const { env } = fakeEnv();
    const get = () => worker.fetch(new Request(`${ORIGIN}/healthz`) as never, env, fakeCtx().ctx);

    expect((await get()).status).toBe(503);
    expect(boots).toBe(1);
    up = true;
    const [a, b] = await Promise.all([get(), get()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await get();
    expect(boots).toBe(2);
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({ event: "boot.failed" });
    error.mockRestore();
    await close();
  });

  it("shows the config error page without touching the database", async () => {
    const createDb = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = createWorker({ createDb });
    const { env } = fakeEnv({ SECRET_KEY: "hunter2", OWNER_EMAIL: "" });
    for (const p of ["/healthz", "/", "/v1/inboxes"]) {
      const res = await worker.fetch(new Request(ORIGIN + p) as never, env, fakeCtx().ctx);
      expect(res.status).toBe(500);
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
