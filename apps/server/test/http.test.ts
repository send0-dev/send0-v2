import { createAuth } from "@send0/auth";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { desc } from "drizzle-orm";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_TRUSTED_PROXIES } from "../src/client-ip";
import { createHttpApp } from "../src/http";

const URL_BASE = "https://mail.acme.dev";

describe("createHttpApp routing", () => {
  let app: ReturnType<typeof createHttpApp>;
  let close: () => Promise<void>;
  let root: string;
  let webDir: string;
  let db: Db;
  let healthy = true;

  beforeAll(async () => {
    const t = await createTestDb();
    close = t.close;
    db = t.db;
    root = await mkdtemp(path.join(tmpdir(), "send0-web-"));
    webDir = path.join(root, "web");
    await mkdir(webDir);
    await writeFile(path.join(root, "secret.txt"), "TOP-SECRET-OUTSIDE-WEB-DIR");
    await writeFile(path.join(webDir, "index.html"), "<!doctype html><title>send0 dashboard</title>");
    await mkdir(path.join(webDir, "assets"));
    await writeFile(path.join(webDir, "assets", "app-abc123.js"), "console.log('app')");
    const auth = createAuth({ db: t.db, from: { name: "send0", email: "noreply@acme.dev" }, appUrl: URL_BASE });
    app = createHttpApp(
      {
        auth,
        apiDeps: { db: t.db, mailDomains: ["acme.dev"], files: { signedGetUrl: async () => "x" } },
        ping: async () => {
          if (!healthy) throw new Error("connection refused");
        },
      },
      { publicUrl: URL_BASE, mailDomains: ["acme.dev"], webDir, trustedProxies: DEFAULT_TRUSTED_PROXIES },
    );
  });

  afterAll(async () => {
    await close();
    await rm(root, { recursive: true, force: true });
  });

  /** A request as @hono/node-server hands it over, from a socket peer at `peer`. */
  const get = (p: string, init?: RequestInit, peer = "203.0.113.7") =>
    app.request(URL_BASE + p, init, { incoming: { socket: { remoteAddress: peer } } });

  /** Signs up through the dashboard and returns the IP recorded on the new session, plus its cookie. */
  const signUpFrom = async (peer: string, email: string, headers: Record<string, string>) => {
    const r = await get(
      "/auth/signup",
      {
        method: "POST",
        headers: { origin: URL_BASE, "content-type": "application/json", ...headers },
        body: JSON.stringify({ email, password: "tangerine-orbit-42" }),
      },
      peer,
    );
    expect(r.status).toBe(201);
    const [session] = await db.select().from(schema.sessions).orderBy(desc(schema.sessions.createdAt)).limit(1);
    return { ip: session!.ip, cookie: r.headers.get("set-cookie")!.split(";")[0]! };
  };

  it("sends /v1 to the API, which wants a key", async () => {
    const r = await get("/v1/inboxes");
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect(((await r.json()) as any).error.code).toBeTruthy();
  });

  it("serves the OpenAPI spec and the API's own health check", async () => {
    const spec = await get("/openapi.json");
    expect(spec.status).toBe(200);
    expect(((await spec.json()) as any).openapi).toMatch(/^3\.1/);
    expect(await (await get("/health")).json()).toEqual({ ok: true });
  });

  it("sends /auth and /api to the dashboard app", async () => {
    const instance = await get("/auth/instance");
    expect(await instance.json()).toEqual({ mail_domains: ["acme.dev"], signup_open: true });
    expect((await get("/api/v1/inboxes")).status).toBe(401);
  });

  it("refuses cross-site writes to the dashboard", async () => {
    const r = await get("/auth/login", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });

  it("serves the SPA at / and for client-side routes", async () => {
    for (const p of ["/", "/inboxes", "/inboxes/ibx_123/threads"]) {
      const r = await get(p);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain("send0 dashboard");
      expect(r.headers.get("cache-control")).toBe("no-cache");
    }
  });

  it("serves fingerprinted assets with a long cache", async () => {
    const r = await get("/assets/app-abc123.js");
    expect(await r.text()).toContain("console.log");
    expect(r.headers.get("cache-control")).toContain("immutable");
  });

  it("answers a missing asset with 404, not the app shell, and no long cache", async () => {
    const r = await get("/assets/app-gone999.js");
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain("send0 dashboard");
    expect(r.headers.get("cache-control")).toBeNull();
  });

  it("never serves files outside the web directory", async () => {
    for (const p of [
      "/..%2fsecret.txt",
      "/%2e%2e/secret.txt",
      "/%2e%2e%2fsecret.txt",
      "/assets/..%2f..%2fsecret.txt",
      "/assets/%2e%2e/%2e%2e/secret.txt",
      "/..%5csecret.txt",
      "/%252e%252e/secret.txt",
    ]) {
      const r = await get(p);
      expect(await r.text(), p).not.toContain("TOP-SECRET");
    }
  });

  it("replaces a spoofed client IP with the socket peer", async () => {
    const { ip } = await signUpFrom("203.0.113.7", "spoof@acme.dev", { "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "8.8.8.8" });
    expect(ip).toBe("203.0.113.7");
  });

  it("believes X-Forwarded-For from a trusted proxy, taking the right-most untrusted hop", async () => {
    const { ip } = await signUpFrom("172.18.0.3", "proxied@acme.dev", { "x-forwarded-for": "6.6.6.6, 198.51.100.4, 10.0.0.2" });
    expect(ip).toBe("198.51.100.4");
  });

  it("drops a forged cf-ray before the API sees it", async () => {
    const r = await get("/v1/inboxes", { headers: { "cf-ray": "forged-ray" } });
    expect(r.headers.get("x-request-id")).not.toBe("forged-ray");
  });

  it("keeps the dashboard session out of the public API", async () => {
    const { ip, cookie } = await signUpFrom("203.0.113.9", "cookie@acme.dev", { "x-forwarded-for": "198.51.100.4" });
    expect(ip).toBe("203.0.113.9"); // XFF from an untrusted peer is ignored
    const r = await get("/v1/inboxes", { headers: { cookie } });
    expect(r.status).toBe(401);
  });

  it("reports health from the database", async () => {
    expect(await (await get("/healthz")).json()).toEqual({ ok: true });
    healthy = false;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await get("/healthz");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, error: "database_unreachable" });
    log.mockRestore();
    healthy = true;
  });
});
