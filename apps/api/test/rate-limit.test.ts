import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TokenUrlSigner } from "@send0/adapters/blob";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { bindingRateLimiter, MemoryRateLimiter, type RateLimiter, type RateRule } from "../src/rate-limit";
import { setup, type TestEnv } from "./helpers";

describe("MemoryRateLimiter", () => {
  const rules = { key: { limit: 3, periodSeconds: 60 } };

  it("allows up to the limit in a window, then says how long to wait", async () => {
    let now = 1_000_000;
    const rl = new MemoryRateLimiter({ rules, now: () => now });
    for (let i = 0; i < 3; i++) expect(await rl.limit("a", "key")).toEqual({ ok: true, retryAfter: 0 });
    now += 20_500;
    expect(await rl.limit("a", "key")).toEqual({ ok: false, retryAfter: 40 });
    // Other keys and other rules count separately.
    expect((await rl.limit("b", "key")).ok).toBe(true);
    expect((await rl.limit("a", "ip")).ok).toBe(true);
  });

  it("starts a fresh window once the period has passed", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter({ rules, now: () => now });
    for (let i = 0; i < 4; i++) await rl.limit("a", "key");
    now = 59_999;
    expect((await rl.limit("a", "key")).ok).toBe(false);
    now = 60_000;
    expect(await rl.limit("a", "key")).toEqual({ ok: true, retryAfter: 0 });
  });

  it("never reports less than a second to wait", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter({ rules, now: () => now });
    for (let i = 0; i < 3; i++) await rl.limit("a", "key");
    now = 59_900;
    expect(await rl.limit("a", "key")).toEqual({ ok: false, retryAfter: 1 });
  });

  it("stays within maxEntries, dropping the least recently seen first", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter({ rules, maxEntries: 5, now: () => now });
    for (let i = 0; i < 5; i++) await rl.limit(`k${i}`, "key");
    await rl.limit("k0", "key"); // k0 is now the most recent
    for (let i = 5; i < 20; i++) {
      now += 1;
      await rl.limit(`k${i}`, "key");
      expect(rl.size).toBeLessThanOrEqual(5);
    }
    // A key that was dropped starts over.
    for (let i = 0; i < 3; i++) expect((await rl.limit("k1", "key")).ok).toBe(true);
  });

  it("drops expired windows when making room", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter({ rules, now: () => now });
    for (let i = 0; i < 100; i++) await rl.limit(`k${i}`, "key");
    expect(rl.size).toBe(100);
    now = 61_000;
    await rl.limit("fresh", "key");
    expect(rl.size).toBe(1);
  });
});

describe("bindingRateLimiter", () => {
  it("uses the binding for a rule, and the fallback when the binding is missing", async () => {
    const seen: string[] = [];
    const binding = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: key !== "blocked" }) };
    const fallback = new MemoryRateLimiter({ rules: { ip: { limit: 1, periodSeconds: 60 } } });
    const rl = bindingRateLimiter({ key: binding, ip: undefined }, fallback);
    expect(await rl.limit("ok", "key")).toEqual({ ok: true, retryAfter: 0 });
    expect(await rl.limit("blocked", "key")).toEqual({ ok: false, retryAfter: 60 });
    expect(seen).toEqual(["ok", "blocked"]);
    expect((await rl.limit("1.2.3.4", "ip")).ok).toBe(true);
    expect((await rl.limit("1.2.3.4", "ip")).ok).toBe(false);
    expect(seen).toHaveLength(2);
  });
});

/** Records every check; `deny` (or a real limiter in `inner`) decides the answer. */
const calls: [string, RateRule][] = [];
let deny: (key: string, rule: RateRule) => boolean = () => false;
let inner: RateLimiter | null = null;
const fake: RateLimiter = {
  async limit(key, rule) {
    calls.push([key, rule]);
    if (inner) return inner.limit(key, rule);
    return deny(key, rule) ? { ok: false, retryAfter: 17 } : { ok: true, retryAfter: 0 };
  },
};
const rules = () => calls.map(([, r]) => r);

let t: TestEnv;
let inboxId: string;
const signer = new TokenUrlSigner({ secret: "s".repeat(32), baseUrl: "https://api.test" });

beforeAll(async () => {
  t = await setup({
    rateLimiter: fake,
    mailer: { sendRaw: async () => ({ providerMessageId: "ses-1" }) },
    queue: { send: async () => {} },
    fileServer: { signer, reader: { get: async () => null } },
    sesEvents: { token: "tok_" + "x".repeat(40), topicArn: "arn:aws:sns:ap-south-1:1:send0-ses-events" },
  });
  inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "limited" } })).body.id;
});
afterAll(() => t.close());
beforeEach(() => {
  calls.length = 0;
  deny = () => false;
  inner = null;
});

describe("rate limits in the API", () => {
  it("limits each API key, answering 429 with Retry-After", async () => {
    expect((await t.call("GET", "/v1/inboxes")).status).toBe(200);
    expect(calls).toEqual([[expect.stringMatching(/^key:key_/), "key"]]);

    deny = (_k, rule) => rule === "key";
    const r = await t.call("GET", "/v1/inboxes");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("17");
    expect(r.body.error).toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Slow down and retry after 17 seconds.",
    });
    expect(r.body.error.request_id).toBeTruthy();
  });

  it("counts each key separately", async () => {
    const other = await t.makeKey();
    await t.call("GET", "/v1/inboxes");
    await t.call("GET", "/v1/inboxes", { key: other });
    expect(new Set(calls.map(([k]) => k)).size).toBe(2);
  });

  it("adds the send rule only to requests that send mail", async () => {
    await t.call("GET", `/v1/inboxes/${inboxId}/messages`);
    await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?timeout=1`);
    await t.call("PATCH", `/v1/inboxes/${inboxId}`, { body: { display_name: "Limited" } });
    await t.call("POST", "/v1/webhooks", { body: { url: "https://example.com/hook" } });
    expect(rules().every((r) => r === "key")).toBe(true);
    expect(calls).toHaveLength(4); // wait is one request, however long it waits

    const sends: [string, string][] = [
      ["POST", `/v1/inboxes/${inboxId}/messages`],
      ["POST", "/v1/messages/msg_nope/reply"],
      ["POST", "/v1/messages/msg_nope/forward"],
      ["POST", "/v1/drafts/drf_nope/send"],
    ];
    for (const [method, path] of sends) {
      calls.length = 0;
      await t.call(method, path, { body: { to: "dana@gmail.com", subject: "Hi", text: "Hello" } });
      expect(rules(), path).toEqual(["key", "key_send"]);
    }

    calls.length = 0;
    await t.call("POST", "/v1/drafts/drf_nope/reject");
    expect(rules()).toEqual(["key"]);
  });

  it("refuses sends over the send limit while other requests still work", async () => {
    deny = (_k, rule) => rule === "key_send";
    const r = await t.call("POST", `/v1/inboxes/${inboxId}/messages`, { body: { to: "dana@gmail.com", subject: "Hi", text: "Hello" } });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("rate_limited");
    expect((await t.call("GET", "/v1/inboxes")).status).toBe(200);
  });

  it("doesn't store a 429 against the Idempotency-Key, so the retry runs", async () => {
    const headers = { "idempotency-key": "rl-retry-1" };
    deny = (_k, rule) => rule === "key_send";
    const first = await t.call("POST", "/v1/messages/msg_nope/reply", { body: { text: "x" }, headers });
    expect(first.status).toBe(429);
    deny = () => false;
    const retry = await t.call("POST", "/v1/messages/msg_nope/reply", { body: { text: "x" }, headers });
    expect(retry.status).toBe(404);
    expect(retry.headers.get("idempotent-replayed")).toBeNull();
  });

  it("limits failed authentication per client IP, without slowing valid keys", async () => {
    inner = new MemoryRateLimiter();
    const from = (ip: string) => ({ "cf-connecting-ip": ip });
    for (let i = 0; i < 30; i++) {
      expect((await t.call("GET", "/v1/inboxes", { key: null, headers: from("203.0.113.9") })).status).toBe(401);
      expect((await t.call("GET", "/v1/inboxes", { key: "s0_live_" + "x".repeat(40), headers: from("203.0.113.9") })).status).toBe(401);
    }
    const r = await t.call("GET", "/v1/inboxes", { key: "s0_live_" + "y".repeat(40), headers: from("203.0.113.9") });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("rate_limited");
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address is unaffected, and so is a real key from the same one.
    expect((await t.call("GET", "/v1/inboxes", { key: null, headers: from("203.0.113.10") })).status).toBe(401);
    expect((await t.call("GET", "/v1/inboxes", { headers: from("203.0.113.9") })).status).toBe(200);
    expect(calls.filter(([, r]) => r === "ip").every(([k]) => k.startsWith("ip:203.0.113."))).toBe(true);
  });

  it("limits dashboard members per person", async () => {
    const member = createApp({
      db: t.db,
      mailDomains: ["send0.email"],
      files: { signedGetUrl: async () => "x" },
      rateLimiter: fake,
      presetAuth: { orgId: t.orgId, keyId: "usr_member", mode: "live", scopes: ["admin"], inboxIds: null, actor: "user" },
    });
    expect((await member.request("/v1/inboxes")).status).toBe(200);
    await member.request("/v1/drafts/drf_nope/send", { method: "POST" });
    expect(calls).toEqual([
      ["user:usr_member", "key"],
      ["user:usr_member", "key"],
      ["user:usr_member", "key_send"],
    ]);
    deny = () => true;
    expect((await member.request("/v1/inboxes")).status).toBe(429);
  });

  it("leaves health, the spec and SES events alone, and limits signed links by IP", async () => {
    deny = () => true;
    const ip = { "cf-connecting-ip": "198.51.100.7" };
    expect((await t.app.request("/health", { headers: ip })).status).toBe(200);
    expect((await t.app.request("/openapi.json", { headers: ip })).status).toBe(200);
    expect((await t.app.request("/", { headers: ip })).status).toBe(200);
    const ses = await t.app.request("/internal/ses-events?token=wrong", { method: "POST", headers: ip, body: "{}" });
    expect(ses.status).not.toBe(429);
    expect(calls).toEqual([]);

    const file = await t.app.request("/v1/files/whatever", { headers: ip });
    expect(file.status).toBe(429);
    expect(calls).toEqual([["ip:198.51.100.7", "ip"]]);
    deny = () => false;
    expect((await t.app.request("/v1/files/whatever", { headers: ip })).status).toBe(403);
  });

  it("counts a remote MCP request once against the key, and its sends against the send limit", async () => {
    const appFetch = ((input: RequestInfo | URL, init?: RequestInit) => t.app.fetch(new Request(input, init))) as typeof fetch;
    const client = new Client({ name: "limited-agent", version: "1.0.0" });
    calls.length = 0;
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://api.test/mcp"), {
        fetch: appFetch,
        requestInit: { headers: { authorization: `Bearer ${t.adminKey}` } },
      }),
    );
    // Connecting is initialize, initialized and a GET for the server's stream, each a request with the key.
    await vi.waitFor(() => expect(rules()).toEqual(["key", "key", "key"]));
    calls.length = 0;
    await client.callTool({ name: "list_inboxes", arguments: {} });
    expect(rules()).toEqual(["key"]);

    calls.length = 0;
    await client.callTool({ name: "send_email", arguments: { inbox_id: inboxId, to: "dana@gmail.com", subject: "Hi", text: "Hello" } });
    expect(rules()).toEqual(["key", "key_send"]);

    deny = (_k, rule) => rule === "key_send";
    const refused = (await client.callTool({
      name: "send_email",
      arguments: { inbox_id: inboxId, to: "dana@gmail.com", subject: "Hi", text: "Hello" },
    })) as { isError?: boolean; content: { text: string }[] };
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toMatch(/rate_limited: Too many requests\. Slow down and retry after 17 seconds\./);
    await client.close();
  });
});

describe("without a rate limiter", () => {
  it("nothing is limited", async () => {
    const plain = createApp({ db: t.db, mailDomains: ["send0.email"], files: { signedGetUrl: async () => "x" } });
    for (let i = 0; i < 100; i++) {
      const r = await plain.request("/v1/inboxes", { headers: { "cf-connecting-ip": "192.0.2.1" } });
      expect(r.status).toBe(401);
    }
    expect(calls).toEqual([]);
  });
});
