import { describe, expect, it } from "vitest";
import { HubState, type EventEnvelope } from "../src";

const event = (id: string, createdAt: number): EventEnvelope => ({
  id,
  object: "event",
  type: "message.received",
  created_at: new Date(createdAt).toISOString(),
  inbox_id: "ibx_1",
  data: { direction: "in", from: { email: "a@b.c" }, subject: "hi" },
});

describe("HubState.isIdle", () => {
  it("is idle only with no subscribers, no waiters and no fresh recent events", async () => {
    let now = Date.now();
    const hub = new HubState(() => now);
    expect(hub.isIdle()).toBe(true);

    const unsubscribe = hub.subscribe(() => {});
    expect(hub.isIdle()).toBe(false);
    unsubscribe();

    const waiting = hub.wait({ subject: "never" }, now, 10);
    expect(hub.isIdle()).toBe(false);
    expect(await waiting).toBeNull();
    expect(hub.isIdle()).toBe(true);

    hub.notify(event("e1", now));
    expect(hub.isIdle()).toBe(false);
    now += 11 * 60 * 1000; // past the recent buffer's age limit
    expect(hub.isIdle()).toBe(true);
  });
});

describe("HubState.comment", () => {
  it("sends an SSE comment line to every subscriber", async () => {
    const hub = new HubState();
    const got: string[] = [];
    hub.subscribe((c) => void got.push(c));
    hub.comment("resync");
    hub.ping();
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([": resync\n\n", ": ping\n\n"]);
  });
});

describe("HubState.close", () => {
  it("settles pending waits with null and drops subscribers", async () => {
    const hub = new HubState();
    hub.subscribe(() => {});
    const waiting = hub.wait({}, Date.now(), 120_000);
    hub.close();
    expect(await waiting).toBeNull();
    expect(hub.isIdle()).toBe(true);
  });
});
