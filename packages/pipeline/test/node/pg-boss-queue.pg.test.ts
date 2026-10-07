import { createPgTestDatabase, TEST_DATABASE_URL } from "@send0/db/testing-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QueueMessage } from "../../src";
import { PgBossQueue } from "../../src/node/pg-boss-queue";

/** Resolves once `check` passes, polling every 50ms, or rejects after `ms`. */
async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(!TEST_DATABASE_URL)("PgBossQueue", () => {
  let drop: () => Promise<void>;
  let url: string;
  let queue: PgBossQueue;
  const received: { msg: QueueMessage; at: number }[] = [];
  const attempts = new Map<string, number>();

  beforeAll(async () => {
    ({ url, drop } = await createPgTestDatabase());
    queue = await PgBossQueue.start({ url, retryDelaySeconds: 1, pollingIntervalSeconds: 0.5 });
    await queue.consume(async (msg) => {
      const id = msg.kind === "fanout" ? msg.eventId : msg.deliveryId;
      const n = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, n);
      if (id.startsWith("evt_flaky") && n === 1) throw new Error("transient");
      received.push({ msg, at: Date.now() });
    });
  });

  afterAll(async () => {
    await queue?.stop();
    await drop?.();
  });

  const got = (id: string) => received.find((r) => (r.msg.kind === "fanout" ? r.msg.eventId : r.msg.deliveryId) === id);

  it("delivers a sent message to the consumer", async () => {
    await queue.send({ kind: "fanout", eventId: "evt_1" });
    await until(() => !!got("evt_1"));
    expect(got("evt_1")!.msg).toEqual({ kind: "fanout", eventId: "evt_1" });
  });

  it("retries a handler that throws, and the second attempt succeeds", async () => {
    await queue.send({ kind: "fanout", eventId: "evt_flaky" });
    await until(() => !!got("evt_flaky"), 15_000);
    expect(attempts.get("evt_flaky")).toBe(2);
  });

  it("holds a delayed message until its delay passes", async () => {
    const sentAt = Date.now();
    await queue.send({ kind: "deliver", deliveryId: "dlv_later" }, { delaySeconds: 2 });
    await new Promise((r) => setTimeout(r, 1000));
    expect(got("dlv_later")).toBeUndefined();
    await until(() => !!got("dlv_later"));
    expect(got("dlv_later")!.at - sentAt).toBeGreaterThanOrEqual(1900);
  });

  it("starts again on the same database (a restart), and both instances share the queue", async () => {
    const second = await PgBossQueue.start({ url, pollingIntervalSeconds: 0.5 });
    try {
      await second.send({ kind: "fanout", eventId: "evt_from_second" });
      await until(() => !!got("evt_from_second"));
    } finally {
      await second.stop();
    }
  });

  it("registers a cron schedule", async () => {
    await expect(queue.schedule("send0-sweep", "*/5 * * * *", async () => {})).resolves.toBeUndefined();
  });
});
