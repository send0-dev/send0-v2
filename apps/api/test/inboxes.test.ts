import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup, type TestEnv } from "./helpers";

let t: TestEnv;
beforeAll(async () => {
  t = await setup();
  await t.db.update(schema.orgs).set({ plan: "pro" }).where(eq(schema.orgs.id, t.orgId));
});
afterAll(() => t.close());

describe("inboxes", () => {
  it("creates name@send0.email with safe defaults", async () => {
    const r = await t.call("POST", "/v1/inboxes", { body: { name: "Research-Agent", display_name: "Research" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      object: "inbox",
      address: "research-agent@send0.email",
      local_part: "research-agent",
      domain: "send0.email",
      display_name: "Research",
      send_policy: "reply_only",
      status: "active",
      mode: "live",
    });
    expect(r.body.id).toMatch(/^ibx_/);
  });

  it("generates a name when none is given", async () => {
    const r = await t.call("POST", "/v1/inboxes", { body: {} });
    expect(r.status).toBe(201);
    expect(r.body.local_part).toMatch(/^agent-[0-9a-z]{6}$/);
  });

  it("refuses taken, reserved and invalid names", async () => {
    expect((await t.call("POST", "/v1/inboxes", { body: { name: "RESEARCH-agent" } })).body.error.code).toBe("address_taken");
    expect((await t.call("POST", "/v1/inboxes", { body: { name: "postmaster" } })).body.error).toMatchObject({
      code: "invalid_request",
      param: "name",
    });
    expect((await t.call("POST", "/v1/inboxes", { body: { name: "bad name!" } })).status).toBe(400);
    expect((await t.call("POST", "/v1/inboxes", { body: { name: "x", domain: "gmail.com" } })).body.error.param).toBe("domain");
  });

  it("gets, lists, updates and soft-deletes", async () => {
    const { body: ibx } = await t.call("POST", "/v1/inboxes", { body: { name: "ops", metadata: { team: "ops" } } });
    expect((await t.call("GET", `/v1/inboxes/${ibx.id}`)).body.metadata).toEqual({ team: "ops" });

    const patched = await t.call("PATCH", `/v1/inboxes/${ibx.id}`, { body: { send_policy: "approval", display_name: null } });
    expect(patched.body).toMatchObject({ send_policy: "approval", display_name: null });
    expect((await t.call("PATCH", `/v1/inboxes/${ibx.id}`, { body: {} })).status).toBe(400);

    const list = await t.call("GET", "/v1/inboxes?limit=100");
    expect(list.body.data.map((i: any) => i.id)).toContain(ibx.id);

    const del = await t.call("DELETE", `/v1/inboxes/${ibx.id}`);
    expect(del.body).toMatchObject({ deleted: true, status: "deleted" });
    expect((await t.call("GET", `/v1/inboxes/${ibx.id}`)).status).toBe(404);
    // The address stays taken after deletion.
    expect((await t.call("POST", "/v1/inboxes", { body: { name: "ops" } })).body.error.code).toBe("address_taken");
  });

  it("limits inbox-scoped keys to their own inboxes", async () => {
    const { body: a } = await t.call("POST", "/v1/inboxes", { body: { name: "agent-a" } });
    const { body: b } = await t.call("POST", "/v1/inboxes", { body: { name: "agent-b" } });
    const key = await t.makeKey({ scopes: ["read", "send"], inboxIds: [a.id] });

    expect((await t.call("GET", `/v1/inboxes/${a.id}`, { key })).status).toBe(200);
    expect((await t.call("GET", `/v1/inboxes/${b.id}`, { key })).status).toBe(404);
    const list = await t.call("GET", "/v1/inboxes?limit=100", { key });
    expect(list.body.data.map((i: any) => i.id)).toEqual([a.id]);
    expect((await t.call("POST", "/v1/inboxes", { key, body: { name: "sneaky" } })).status).toBe(403);
    expect((await t.call("DELETE", `/v1/inboxes/${a.id}`, { key })).status).toBe(403);
  });

  it("enforces scopes", async () => {
    const readOnly = await t.makeKey({ scopes: ["read"] });
    expect((await t.call("POST", "/v1/inboxes", { key: readOnly, body: { name: "nope" } })).status).toBe(403);
  });

  it("enforces the plan's inbox limit", async () => {
    await t.db.update(schema.orgs).set({ plan: "free" }).where(eq(schema.orgs.id, t.orgId));
    let r = await t.call("POST", "/v1/inboxes", { body: {} });
    for (let i = 0; r.status === 201 && i < 10; i++) r = await t.call("POST", "/v1/inboxes", { body: {} });
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe("plan_limit_reached");
    // Deleted inboxes don't count toward the limit.
    const active = (await t.call("GET", "/v1/inboxes?limit=100")).body.data;
    expect(active).toHaveLength(5);
    await t.db.update(schema.orgs).set({ plan: "pro" }).where(eq(schema.orgs.id, t.orgId));
  });

  it("never shows another org's inbox", async () => {
    const { newId } = await import("@send0/core");
    const other = newId("org");
    await t.db.insert(schema.orgs).values({ id: other, name: "Other" });
    const otherKey = await t.makeKey({ orgId: other });
    const { body: mine } = await t.call("POST", "/v1/inboxes", { body: { name: "private" } });
    expect((await t.call("GET", `/v1/inboxes/${mine.id}`, { key: otherKey })).status).toBe(404);
    expect((await t.call("DELETE", `/v1/inboxes/${mine.id}`, { key: otherKey })).status).toBe(404);
  });
});
