import { createAuth } from "@send0/auth";
import { createTestDb } from "@send0/db/testing";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHttpApp } from "../src/http";

const URL_BASE = "https://mail.acme.dev";

describe("createHttpApp routing", () => {
  let app: ReturnType<typeof createHttpApp>;
  let close: () => Promise<void>;
  let webDir: string;
  let healthy = true;

  beforeAll(async () => {
    const t = await createTestDb();
    close = t.close;
    webDir = await mkdtemp(path.join(tmpdir(), "send0-web-"));
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
      { publicUrl: URL_BASE, mailDomains: ["acme.dev"], webDir },
    );
  });

  afterAll(async () => {
    await close();
    await rm(webDir, { recursive: true, force: true });
  });

  const get = (p: string, init?: RequestInit) => app.request(URL_BASE + p, init);

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
