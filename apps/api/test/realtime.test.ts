import type { EventEnvelope } from "@send0/pipeline";
import { hubName } from "@send0/pipeline";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { HubClient } from "../src/realtime/client";
import { formatSse, HubState } from "../src/realtime/hub-state";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

const env = (id: string, over: Partial<EventEnvelope> & { data?: any } = {}): EventEnvelope => ({
  id,
  object: "event",
  type: "message.received",
  created_at: new Date().toISOString(),
  inbox_id: "ibx_1",
  data: { id: "msg_" + id, direction: "in", from: { email: "noreply@acme.dev" }, subject: "Your code" },
  ...over,
});

describe("HubState", () => {
  it("resolves a waiter on the first matching event and ignores others", async () => {
    const hub = new HubState();
    const p = hub.wait({ from: "*@acme.dev" }, Date.now() - 1000, 5000);
    hub.notify(env("e1", { data: { id: "m", direction: "in", from: { email: "x@other.com" }, subject: "nope" } }));
    hub.notify(env("e2"));
    expect((await p)?.id).toBe("e2");
    expect(hub.waiterCount).toBe(0);
  });

  it("answers from the recent buffer when the event came first", async () => {
    const hub = new HubState();
    hub.notify(env("early"));
    expect((await hub.wait({}, Date.now() - 60_000, 10))?.id).toBe("early");
  });

  it("respects since, direction and timeout", async () => {
    vi.useFakeTimers();
    const hub = new HubState();
    hub.notify(env("old", { created_at: new Date(Date.now() - 120_000).toISOString() }));
    hub.notify(env("outbound", { data: { id: "m", direction: "out", from: { email: "a@b.c" }, subject: "s" } }));
    const p = hub.wait({}, Date.now() - 60_000, 1000);
    vi.advanceTimersByTime(1001);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });

  it("fans events out to SSE subscribers once, and drops dead ones", async () => {
    const hub = new HubState();
    const got: string[] = [];
    hub.subscribe((c) => void got.push(c));
    hub.subscribe(() => Promise.reject(new Error("closed")));
    hub.notify(env("e1"));
    hub.notify(env("e1")); // duplicate delivery upstream
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([formatSse(env("e1", { created_at: JSON.parse(got[0]!.split("data: ")[1]!).created_at }))]);
    expect(hub.subscriberCount).toBe(1);
  });
});

/** In-process hub registry standing in for the Durable Object namespace. */
function memoryHubs() {
  const hubs = new Map<string, HubState>();
  const get = (name: string) => hubs.get(name) ?? hubs.set(name, new HubState()).get(name)!;
  const client: HubClient = {
    wait: (inboxId, f, since, timeout) => get(hubName.inbox(inboxId)).wait(f, since, timeout),
    stream: async (name) => {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const w = writable.getWriter();
      get(name).subscribe((c) => w.write(new TextEncoder().encode(c)));
      return new Response(readable);
    },
  };
  return { client, get };
}

describe("GET /messages/wait", () => {
  let t: TestEnv;
  let inboxId: string;
  const hubs = memoryHubs();

  beforeAll(async () => {
    t = await setup({ hub: hubs.client });
    inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "signup-agent" } })).body.id;
  });
  afterAll(() => t.close());

  it("returns a message that already arrived within the look-back window", async () => {
    await deliver(t.db, "signup-agent@send0.email", fixture("otp-subject.eml"));
    const r = await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?from=*@linear.app&timeout=1`);
    expect(r.body).toMatchObject({ object: "wait_result", timed_out: false });
    expect(r.body.message.extracted.otp).toBe("731902");
  });

  it("blocks until a matching message arrives, then returns it with the code", async () => {
    const pending = t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?from=*@acme.dev&subject=verification&timeout=5`);
    await new Promise((r) => setTimeout(r, 100));
    const res = await deliver(t.db, "signup-agent@send0.email", fixture("otp-html-only.eml"));
    if (res.duplicate) throw new Error("dup");
    hubs.get(hubName.inbox(inboxId)).notify(res.envelope);
    const r = await pending;
    expect(r.body.timed_out).toBe(false);
    expect(r.body.message).toMatchObject({ id: res.messageId, extracted: { otp: "482913" } });
  });

  it("times out cleanly", async () => {
    const started = Date.now();
    const r = await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?from=*@never.example&timeout=1`);
    expect(r.body).toEqual({ object: "wait_result", timed_out: true, message: null });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("ignores messages older than since", async () => {
    const r = await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?from=*@linear.app&timeout=1&since=${new Date(Date.now() + 1000).toISOString()}`);
    expect(r.body.timed_out).toBe(true);
  });

  it("validates timeout", async () => {
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?timeout=500`)).body.error.param).toBe("timeout");
  });

  it("is scoped like every other inbox route", async () => {
    const key = await t.makeKey({ scopes: ["read"], inboxIds: ["ibx_other"] });
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/messages/wait?timeout=1`, { key })).status).toBe(404);
  });
});

describe("GET /events/stream", () => {
  let t: TestEnv;
  let inboxId: string;
  const hubs = memoryHubs();

  beforeAll(async () => {
    t = await setup({ hub: hubs.client });
    inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "stream-agent" } })).body.id;
  });
  afterAll(() => t.close());

  async function readUntil(res: Response, pred: (s: string) => boolean): Promise<string> {
    const reader = res.body!.getReader();
    let text = "";
    const dec = new TextDecoder();
    while (!pred(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    await reader.cancel();
    return text;
  }

  it("streams live events for an inbox", async () => {
    const res = await t.app.request(`/v1/events/stream?inbox_id=${inboxId}`, { headers: { authorization: `Bearer ${t.adminKey}` } });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const d = await deliver(t.db, "stream-agent@send0.email", fixture("gmail-reply.eml"));
    if (d.duplicate) throw new Error("dup");
    setTimeout(() => hubs.get(hubName.inbox(inboxId)).notify(d.envelope), 20);
    const text = await readUntil(res, (s) => s.includes("event: message.received"));
    expect(text).toContain("retry: 3000");
    expect(text).toContain(`id: ${d.envelope.id}`);
    expect(text).toContain('"type":"message.received"');
  });

  it("replays events after Last-Event-ID", async () => {
    const a = await deliver(t.db, "stream-agent@send0.email", fixture("forwarded.eml"), new Date(Date.now() + 1000));
    const b = await deliver(t.db, "stream-agent@send0.email", fixture("magic-link.eml"), new Date(Date.now() + 2000));
    if (a.duplicate || b.duplicate) throw new Error("dup");
    const res = await t.app.request(`/v1/events/stream?inbox_id=${inboxId}`, {
      headers: { authorization: `Bearer ${t.adminKey}`, "last-event-id": a.envelope.id },
    });
    const text = await readUntil(res, (s) => s.includes(b.envelope.id));
    expect(text).toContain(`id: ${b.envelope.id}`);
    expect(text).not.toContain(`id: ${a.envelope.id}`);
  });

  it("requires inbox_id for inbox-scoped keys", async () => {
    const key = await t.makeKey({ scopes: ["read"], inboxIds: [inboxId] });
    expect((await t.call("GET", "/v1/events/stream", { key })).status).toBe(403);
  });
});
