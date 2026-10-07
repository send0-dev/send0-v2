import { NO_LIMITS } from "@send0/config";
import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

const mailer = { sendRaw: async () => ({ providerMessageId: "relay-1" }) };

describe("mail domains from config", () => {
  let t: TestEnv;
  beforeAll(async () => {
    t = await setup({ mailDomains: ["agents.acme.dev", "bots.acme.dev"], mailer });
    await t.db.update(schema.orgs).set({ plan: "pro" }).where(eq(schema.orgs.id, t.orgId));
  });
  afterAll(() => t.close());

  it("creates inboxes on the first configured domain by default", async () => {
    const r = await t.call("POST", "/v1/inboxes", { body: { name: "buyer" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ address: "buyer@agents.acme.dev", domain: "agents.acme.dev" });
  });

  it("can use any other configured domain", async () => {
    const r = await t.call("POST", "/v1/inboxes", { body: { name: "buyer", domain: "bots.acme.dev" } });
    expect(r.body.address).toBe("buyer@bots.acme.dev");
  });

  it("won't send to reserved addresses on any configured domain", async () => {
    const inbox = (await t.call("POST", "/v1/inboxes", { body: { name: "sender", send_policy: "open" } })).body;
    const r = await t.call("POST", `/v1/inboxes/${inbox.id}/messages`, {
      body: { to: "postmaster@bots.acme.dev", subject: "x", text: "y" },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain("postmaster@bots.acme.dev");
  });
});

describe("limits switched off (self-host)", () => {
  let t: TestEnv;
  let inboxId: string;
  beforeAll(async () => {
    t = await setup({ mailDomains: ["agents.acme.dev"], limits: NO_LIMITS, mailer });
    await t.db.update(schema.orgs).set({ plan: "free", dailySendLimit: 1 }).where(eq(schema.orgs.id, t.orgId));
    inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "ops", send_policy: "open" } })).body.id;
  });
  afterAll(() => t.close());

  it("lets a free-plan org send to new addresses when the inbox is open", async () => {
    const r = await t.call("POST", `/v1/inboxes/${inboxId}/messages`, {
      body: { to: "stranger@example.com", subject: "Hi", text: "Hello" },
    });
    expect(r.status).toBe(201);
  });

  it("ignores the daily cap", async () => {
    const r = await t.call("POST", `/v1/inboxes/${inboxId}/messages`, {
      body: { to: "stranger@example.com", subject: "Again", text: "Hello" },
    });
    expect(r.status).toBe(201);
  });

  it("ignores the plan's inbox cap", async () => {
    for (let i = 0; i < 6; i++) expect((await t.call("POST", "/v1/inboxes", { body: {} })).status).toBe(201);
  });

  it("still honours an inbox's own reply-only policy", async () => {
    const strict = (await t.call("POST", "/v1/inboxes", { body: { name: "strict", send_policy: "reply_only" } })).body;
    const r = await t.call("POST", `/v1/inboxes/${strict.id}/messages`, { body: { to: "stranger@example.com", subject: "x", text: "y" } });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("recipient_not_allowed");
    await deliver(t.db, "strict@agents.acme.dev", fixture("gmail-reply.eml"));
    expect(
      (await t.call("POST", `/v1/inboxes/${strict.id}/messages`, { body: { to: "dana@gmail.com", subject: "x", text: "y" } })).status,
    ).toBe(201);
  });

  it("reports no limits in usage", async () => {
    const r = await t.call("GET", "/v1/usage");
    expect(r.body.inboxes.limit).toBeNull();
    expect(r.body.sends_today.limit).toBeNull();
  });
});
