import { verifyWebhook } from "@send0/core";
import { schema } from "@send0/db";
import type { QueueMessage } from "@send0/pipeline";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attemptDelivery, fanOut, processQueueMessage, RETRY_SCHEDULE_S, sweep } from "../src/webhooks/dispatch";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

const sent: { msg: QueueMessage; delay?: number }[] = [];
const queue = { send: async (msg: QueueMessage, o?: { delaySeconds?: number }) => void sent.push({ msg, delay: o?.delaySeconds }) };

/** A fake customer endpoint that verifies signatures like a real integration would. */
function receiver(secret: () => string, respond: (n: number) => Response | Promise<Response> = () => new Response("ok")) {
  const received: { body: any; headers: Headers; valid: boolean }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const body = String(init.body);
    received.push({ body: JSON.parse(body), headers, valid: await verifyWebhook(secret(), body, headers.get("send0-signature")) });
    return respond(received.length);
  }) as unknown as typeof fetch;
  return { received, fetchImpl };
}

let t: TestEnv;
let inboxA: string;

beforeAll(async () => {
  t = await setup({ queue });
  inboxA = (await t.call("POST", "/v1/inboxes", { body: { name: "hooks-a" } })).body.id;
  await t.call("POST", "/v1/inboxes", { body: { name: "hooks-b" } }); // a second inbox, so "only A" is a real filter
});
afterAll(() => t.close());
beforeEach(() => void (sent.length = 0));

describe("webhook management", () => {
  it("creates a webhook and shows the secret once", async () => {
    const r = await t.call("POST", "/v1/webhooks", { body: { url: "https://example.com/hooks" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      object: "webhook",
      url: "https://example.com/hooks",
      events: ["*"],
      status: "enabled",
      inbox_ids: null,
    });
    expect(r.body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect((await t.call("GET", `/v1/webhooks/${r.body.id}`)).body.secret).toBeUndefined();
    await t.call("DELETE", `/v1/webhooks/${r.body.id}`);
  });

  it.each([
    "http://example.com/x",
    "https://localhost/x",
    "https://10.0.0.5/x",
    "https://169.254.169.254/latest",
    "https://user:pw@example.com",
    "nope",
  ])("rejects unsafe url %s", async (url) =>
    expect((await t.call("POST", "/v1/webhooks", { body: { url } })).body.error).toMatchObject({ param: "url" }),
  );

  it("validates event types and inbox ids, updates and rotates", async () => {
    expect((await t.call("POST", "/v1/webhooks", { body: { url: "https://e.com", events: ["message.exploded"] } })).status).toBe(400);
    expect((await t.call("POST", "/v1/webhooks", { body: { url: "https://e.com", inbox_ids: ["ibx_nope"] } })).body.error.param).toBe(
      "inbox_ids",
    );
    const { body: w } = await t.call("POST", "/v1/webhooks", { body: { url: "https://e.com/a", events: ["message.received"] } });
    const u = await t.call("PATCH", `/v1/webhooks/${w.id}`, { body: { status: "disabled", inbox_ids: [inboxA] } });
    expect(u.body).toMatchObject({ status: "disabled", inbox_ids: [inboxA] });
    const rot = await t.call("POST", `/v1/webhooks/${w.id}/rotate-secret`);
    expect(rot.body.secret).not.toBe(w.secret);
    await t.call("DELETE", `/v1/webhooks/${w.id}`);
  });

  it("is admin-only and org-wide only", async () => {
    const send = await t.makeKey({ scopes: ["read", "send"] });
    const scopedAdmin = await t.makeKey({ scopes: ["admin"], inboxIds: [inboxA] });
    expect((await t.call("GET", "/v1/webhooks", { key: send })).status).toBe(403);
    expect((await t.call("GET", "/v1/webhooks", { key: scopedAdmin })).status).toBe(403);
  });
});

describe("delivery", () => {
  let all: { id: string; secret: string };
  let onlyA: { id: string; secret: string };

  beforeAll(async () => {
    all = (await t.call("POST", "/v1/webhooks", { body: { url: "https://all.example.com/h" } })).body;
    onlyA = (
      await t.call("POST", "/v1/webhooks", { body: { url: "https://a.example.com/h", events: ["message.received"], inbox_ids: [inboxA] } })
    ).body;
    await t.call("POST", "/v1/webhooks", { body: { url: "https://sent.example.com/h", events: ["message.sent"] } });
  });

  it("fans out to matching webhooks only, idempotently", async () => {
    const d = await deliver(t.db, "hooks-b@send0.email", fixture("magic-link.eml"));
    if (d.duplicate) throw new Error("dup");
    const ids1 = await fanOut(t.db, d.envelope.id, new Date());
    const ids2 = await fanOut(t.db, d.envelope.id, new Date());
    const rows = await t.db.select().from(schema.deliveries).where(eq(schema.deliveries.eventId, d.envelope.id));
    expect(rows.map((r) => r.webhookId)).toEqual([all.id]); // not onlyA (other inbox), not sentOnly (other type)
    expect(ids2).toEqual(ids1);
    const [evt] = await t.db.select().from(schema.events).where(eq(schema.events.id, d.envelope.id));
    expect(evt!.dispatchedAt).toBeInstanceOf(Date);
  });

  it("delivers a signed envelope that a customer can verify", async () => {
    const d = await deliver(t.db, "hooks-a@send0.email", fixture("otp-html-only.eml"));
    if (d.duplicate) throw new Error("dup");
    const secrets: Record<string, string> = { "https://all.example.com/h": all.secret, "https://a.example.com/h": onlyA.secret };
    let lastUrl = "";
    const rx = receiver(() => secrets[lastUrl]!);
    const fetchImpl = ((url: string, init: RequestInit) => ((lastUrl = url), rx.fetchImpl(url as never, init))) as typeof fetch;
    await processQueueMessage(t.db, queue, { kind: "fanout", eventId: d.envelope.id }, { fetch: fetchImpl });

    expect(rx.received).toHaveLength(2);
    for (const r of rx.received) {
      expect(r.valid).toBe(true);
      expect(r.headers.get("send0-event-type")).toBe("message.received");
      expect(r.headers.get("send0-event-id")).toBe(d.envelope.id);
      expect(r.body).toMatchObject({ id: d.envelope.id, object: "event", type: "message.received", inbox_id: inboxA });
      expect(r.body.data.extracted.otp).toBe("482913");
    }
    const rows = await t.db.select().from(schema.deliveries).where(eq(schema.deliveries.eventId, d.envelope.id));
    expect(rows.every((r) => r.status === "succeeded" && r.attempts === 1 && r.lastStatusCode === 200)).toBe(true);
    expect(sent).toEqual([]);
  });

  it("retries on failure with backoff, then succeeds", async () => {
    const d = await deliver(t.db, "hooks-b@send0.email", fixture("forwarded.eml"));
    if (d.duplicate) throw new Error("dup");
    const rx = receiver(
      () => all.secret,
      (n) => (n === 1 ? new Response("boom", { status: 503 }) : new Response("ok")),
    );
    await processQueueMessage(t.db, queue, { kind: "fanout", eventId: d.envelope.id }, { fetch: rx.fetchImpl });
    expect(sent).toEqual([{ msg: { kind: "deliver", deliveryId: expect.stringMatching(/^dlv_/) }, delay: RETRY_SCHEDULE_S[0] }]);
    const [row] = await t.db.select().from(schema.deliveries).where(eq(schema.deliveries.eventId, d.envelope.id));
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: 503, lastError: "HTTP 503: boom" });

    await processQueueMessage(t.db, queue, sent[0]!.msg, { fetch: rx.fetchImpl });
    const [after] = await t.db.select().from(schema.deliveries).where(eq(schema.deliveries.id, row!.id));
    expect(after).toMatchObject({ status: "succeeded", attempts: 2, lastError: null });
  });

  it("gives up after the retry schedule", async () => {
    const d = await deliver(t.db, "hooks-b@send0.email", fixture("calendar-invite.eml"));
    if (d.duplicate) throw new Error("dup");
    const [id] = await fanOut(t.db, d.envelope.id, new Date());
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const outcomes = [];
    for (let i = 0; i <= RETRY_SCHEDULE_S.length; i++) outcomes.push((await attemptDelivery(t.db, id!, { fetch: failing })).status);
    expect(outcomes.at(-1)).toBe("failed");
    expect(outcomes.slice(0, -1).every((s) => s === "retry")).toBe(true);
    expect((await attemptDelivery(t.db, id!, { fetch: failing })).status).toBe("skipped");
  });

  it("lists deliveries and replays one", async () => {
    const list = await t.call("GET", `/v1/webhooks/${all.id}/deliveries?status=failed`);
    expect(list.body.data[0]).toMatchObject({
      object: "delivery",
      status: "failed",
      event_type: "message.received",
      attempts: RETRY_SCHEDULE_S.length + 1,
    });
    const replay = await t.call("POST", `/v1/webhooks/${all.id}/deliveries/${list.body.data[0].id}/retry`);
    expect(replay.status).toBe(202);
    expect(replay.body).toMatchObject({ status: "pending", attempts: 0 });
    expect(sent).toEqual([{ msg: { kind: "deliver", deliveryId: list.body.data[0].id }, delay: undefined }]);
  });

  it("sends a test event to one webhook", async () => {
    const r = await t.call("POST", `/v1/webhooks/${onlyA.id}/test`);
    expect(r.status).toBe(202);
    const rx = receiver(() => onlyA.secret);
    await processQueueMessage(t.db, queue, sent[0]!.msg, { fetch: rx.fetchImpl });
    expect(rx.received[0]!.body).toMatchObject({ type: "webhook.test", data: { webhook_id: onlyA.id } });
    expect(rx.received[0]!.valid).toBe(true);
  });

  it("sweeps events that never reached the queue", async () => {
    const old = new Date(Date.now() - 5 * 60_000);
    const d = await deliver(t.db, "hooks-a@send0.email", fixture("apple-mail-reply.eml"), old);
    if (d.duplicate) throw new Error("dup");
    const swept = await sweep(t.db, queue, new Date());
    expect(swept.events).toBeGreaterThanOrEqual(1);
    expect(sent.map((s) => s.msg)).toContainEqual({ kind: "fanout", eventId: d.envelope.id });
  });
});
