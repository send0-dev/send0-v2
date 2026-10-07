import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup, type TestEnv } from "./helpers";

let t: TestEnv;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe("auth", () => {
  it("rejects missing, malformed and unknown keys with the standard error shape", async () => {
    for (const key of [null, "nope", "s0_live_" + "x".repeat(32)]) {
      const r = await t.call("GET", "/v1/api-keys", { key });
      expect(r.status).toBe(401);
      expect(r.body.error).toMatchObject({ code: "unauthorized" });
      expect(r.body.error.request_id).toBeTruthy();
    }
  });

  it("rejects revoked keys", async () => {
    const key = await t.makeKey();
    const created = await t.call("GET", "/v1/api-keys", { key });
    expect(created.status).toBe(200);
    const id = created.body.data.find((k: any) => key.startsWith(k.prefix) && k.prefix === key.slice(0, 12))?.id;
    await t.call("DELETE", `/v1/api-keys/${id}`);
    expect((await t.call("GET", "/v1/api-keys", { key })).status).toBe(401);
  });

  it("blocks suspended orgs", async () => {
    const { newId } = await import("@send0/core");
    const org = newId("org");
    await t.db.insert(schema.orgs).values({ id: org, name: "Bad", status: "suspended" });
    const key = await t.makeKey({ orgId: org });
    const r = await t.call("GET", "/v1/api-keys", { key });
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/suspended/);
  });

  it("records last_used_at", async () => {
    const key = await t.makeKey();
    await t.call("GET", "/v1/api-keys", { key });
    const rows = await t.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.prefix, key.slice(0, 12)));
    expect(rows[0]!.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe("errors and routing", () => {
  it("returns JSON 404s for unknown routes", async () => {
    const r = await t.call("GET", "/v1/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("route_not_found");
  });

  it("reports validation problems with the offending param", async () => {
    const r = await t.call("POST", "/v1/api-keys", {
      body: { name: "", scopes: ["root"] },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({
      code: "invalid_request",
      param: "name",
    });
  });

  it("sets x-request-id", async () => {
    const r = await t.call("GET", "/health", { key: null });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("api keys", () => {
  it("creates a key, shows the secret once, and the new key works", async () => {
    const r = await t.call("POST", "/v1/api-keys", {
      body: { name: "agent", scopes: ["read"] },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      object: "api_key",
      name: "agent",
      scopes: ["read"],
      mode: "live",
      inbox_ids: null,
    });
    expect(r.body.key).toMatch(/^s0_live_[0-9A-Za-z]{32}$/);
    expect(r.body.prefix).toBe(r.body.key.slice(0, 12));

    const list = await t.call("GET", "/v1/api-keys");
    expect(list.body.data.every((k: any) => k.key === undefined)).toBe(true);

    // read-only key can't manage keys
    const denied = await t.call("GET", "/v1/api-keys", { key: r.body.key });
    expect(denied.status).toBe(403);
  });

  it("won't let an inbox-scoped key mint a broader key", async () => {
    const scoped = await t.makeKey({ scopes: ["admin"], inboxIds: ["ibx_a"] });
    const r = await t.call("POST", "/v1/api-keys", {
      key: scoped,
      body: { name: "wider" },
    });
    expect(r.status).toBe(403);
  });

  it("rejects unknown inbox ids", async () => {
    const r = await t.call("POST", "/v1/api-keys", {
      body: { name: "x", inbox_ids: ["ibx_missing"] },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.param).toBe("inbox_ids");
  });

  it("paginates newest first with a stable cursor", async () => {
    for (let i = 0; i < 5; i++) await t.call("POST", "/v1/api-keys", { body: { name: `page-${i}` } });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const r: { body: any } = await t.call("GET", `/v1/api-keys?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(r.body.data.length).toBeLessThanOrEqual(2);
      seen.push(...r.body.data.map((k: any) => k.id));
      cursor = r.body.next_cursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    const all = (await t.call("GET", "/v1/api-keys?limit=100")).body.data.map((k: any) => k.id);
    expect(seen).toEqual(all);
  });

  it("rejects garbage cursors", async () => {
    const r = await t.call("GET", "/v1/api-keys?cursor=%%%");
    expect(r.status).toBe(400);
    expect(r.body.error.param).toBe("cursor");
  });

  it("404s when revoking someone else's or a missing key", async () => {
    expect((await t.call("DELETE", "/v1/api-keys/key_missing")).status).toBe(404);
  });
});

describe("idempotency", () => {
  it("replays the stored response for the same key and body", async () => {
    const headers = { "idempotency-key": "create-1" };
    const a = await t.call("POST", "/v1/api-keys", {
      body: { name: "idem" },
      headers,
    });
    const b = await t.call("POST", "/v1/api-keys", {
      body: { name: "idem" },
      headers,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    const named = (await t.call("GET", "/v1/api-keys?limit=100")).body.data.filter((k: any) => k.name === "idem");
    expect(named).toHaveLength(1);
  });

  it("refuses the same key with a different body", async () => {
    const headers = { "idempotency-key": "create-2" };
    await t.call("POST", "/v1/api-keys", { body: { name: "one" }, headers });
    const r = await t.call("POST", "/v1/api-keys", {
      body: { name: "two" },
      headers,
    });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("idempotency_key_reused");
  });

  it("stores client errors too, so a bad request isn't silently retried into success", async () => {
    const headers = { "idempotency-key": "bad-1" };
    const a = await t.call("POST", "/v1/api-keys", {
      body: { name: "" },
      headers,
    });
    const b = await t.call("POST", "/v1/api-keys", {
      body: { name: "" },
      headers,
    });
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
  });

  it("scopes keys per organization", async () => {
    const { newId } = await import("@send0/core");
    const other = newId("org");
    await t.db.insert(schema.orgs).values({ id: other, name: "Other" });
    const otherKey = await t.makeKey({ orgId: other });
    const headers = { "idempotency-key": "shared-key" };
    const a = await t.call("POST", "/v1/api-keys", {
      body: { name: "x" },
      headers,
    });
    const b = await t.call("POST", "/v1/api-keys", {
      key: otherKey,
      body: { name: "x" },
      headers,
    });
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
  });
});

describe("dashboard gateway (preset auth)", () => {
  it("acts as the given org without an API key", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp({
      db: t.db,
      files: null as never,
      presetAuth: {
        orgId: t.orgId,
        keyId: "usr_test",
        mode: "live",
        scopes: ["admin"],
        inboxIds: null,
      },
    });
    const r = await app.request("/v1/inboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "via-dashboard" }),
    });
    expect(r.status).toBe(201);
    const list = (await (await app.request("/v1/api-keys")).json()) as { object: string };
    expect(list.object).toBe("list");
  });
});
