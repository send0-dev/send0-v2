import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { raiseSendCaps } from "../src/maintenance";
import { setup, type TestEnv } from "./helpers";

let t: TestEnv;
beforeAll(async () => void (t = await setup()));
afterAll(() => t.close());

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
type Status = typeof schema.messages.$inferInsert.status;

/** An org with one inbox and thread, created 40 days before `now` unless told otherwise. */
async function org(opts: Partial<typeof schema.orgs.$inferInsert> = {}) {
  const id = newId("org");
  await t.db.insert(schema.orgs).values({ id, name: id, createdAt: daysAgo(40), ...opts });
  const inboxId = newId("ibx");
  await t.db.insert(schema.inboxes).values({ id: inboxId, orgId: id, domainId: "dom_shared", localPart: id.toLowerCase() });
  const threadId = newId("thr");
  await t.db.insert(schema.threads).values({ id: threadId, orgId: id, inboxId });
  /** Adds `n` outbound messages with this status, `days` days before now. */
  const send = async (n: number, days: number, status: Status = "delivered") => {
    await t.db.insert(schema.messages).values(
      Array.from({ length: n }, () => ({
        id: newId("msg"),
        orgId: id,
        inboxId,
        threadId,
        direction: "out" as const,
        status,
        createdAt: daysAgo(days),
      })),
    );
  };
  return { id, send };
}

const limitOf = async (id: string) =>
  (await t.db.select({ l: schema.orgs.dailySendLimit }).from(schema.orgs).where(eq(schema.orgs.id, id)))[0]!.l;

describe("raising daily send caps", () => {
  it("doubles only the orgs with a clean, busy record, within the plan ceiling", async () => {
    const good = await org(); // 50 → 100
    await good.send(45, 1);

    const bounces = await org(); // 2 hard bounces in 47: 4.3% (under the 5% pause, over the 2% raise)
    await bounces.send(45, 1);
    await bounces.send(2, 10, "bounced");

    const complaint = await org(); // 1 complaint in 46: over 0.1%
    await complaint.send(45, 1);
    await complaint.send(1, 20, "complained");

    const young = await org({ createdAt: daysAgo(2) });
    await young.send(45, 1);

    const quiet = await org(); // 30 sent, but at most 10 a day: under 80% of 50
    await quiet.send(10, 1);
    await quiet.send(10, 2);
    await quiet.send(10, 3);

    const ceiling = await org({ dailySendLimit: 200 }); // free and already at 200
    await ceiling.send(180, 1);

    const nearCeiling = await org({ dailySendLimit: 150 }); // free: 150 → 200, not 300
    await nearCeiling.send(130, 1);

    const handSet = await org({ dailySendLimit: 500 }); // set by an operator above the free ceiling
    await handSet.send(450, 1);

    const paused = await org({ sendingPausedAt: daysAgo(1), sendingPausedReason: "by hand" });
    await paused.send(45, 1);

    const suspended = await org({ status: "suspended" });
    await suspended.send(45, 1);

    const pro = await org({ plan: "pro", dailySendLimit: 200 }); // pro: 200 → 400
    await pro.send(180, 1);

    // Failed sends and old activity don't count toward volume.
    const failedOnly = await org();
    await failedOnly.send(45, 1, "failed");
    const stale = await org();
    await stale.send(45, 8);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const raised = await raiseSendCaps(t.db, now);
    const logged = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    log.mockRestore();

    const expected = [
      { orgId: good.id, from: 50, to: 100 },
      { orgId: nearCeiling.id, from: 150, to: 200 },
      { orgId: pro.id, from: 200, to: 400 },
    ];
    const byId = (a: { orgId: string }, b: { orgId: string }) => a.orgId.localeCompare(b.orgId);
    expect([...raised].sort(byId)).toEqual([...expected].sort(byId));
    expect(logged).toHaveLength(3);
    expect(logged).toContainEqual({ event: "org.limit_raised", org_id: good.id, from: 50, to: 100 });

    for (const o of [bounces, complaint, young, quiet, paused, suspended, failedOnly, stale]) expect(await limitOf(o.id)).toBe(50);
    expect(await limitOf(ceiling.id)).toBe(200);
    expect(await limitOf(handSet.id)).toBe(500);
    expect(await limitOf(good.id)).toBe(100);
    expect(await limitOf(pro.id)).toBe(400);

    // An hour later nothing has changed: 45 sends is under 80% of the new cap of 100.
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await raiseSendCaps(t.db, new Date(now.getTime() + 3600_000))).toEqual([]);
    vi.restoreAllMocks();
  });
});
