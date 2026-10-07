import { createDb, schema, type Db } from "@send0/db";
import { migrateWithLock } from "@send0/db/migrate";
import { createPgTestDatabase, TEST_DATABASE_URL } from "@send0/db/testing-pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { enforceRetention } from "../src/maintenance";

const { orgs, domains, inboxes, threads, messages, attachments, events } = schema;

// The same statements as retention.test.ts (PGlite), on a real Postgres through postgres.js.
describe.skipIf(!TEST_DATABASE_URL)("retention on Postgres", () => {
  let db: Db;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    const database = await createPgTestDatabase();
    drop = database.drop;
    await migrateWithLock(database.url);
    db = createDb(database.url, { max: 2 });
  });
  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
    await drop();
  });

  it("scrubs, deletes, removes empty threads and prunes events", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const now = new Date("2026-11-10T12:00:00Z");
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
    await db.insert(orgs).values({ id: "org_1", name: "Acme" });
    await db.insert(domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
    await db.insert(inboxes).values({ id: "ibx_1", orgId: "org_1", domainId: "dom_1", localPart: "agent", retentionDays: 3 });
    await db.insert(threads).values([
      { id: "thr_old", orgId: "org_1", inboxId: "ibx_1", messageCount: 1 },
      { id: "thr_new", orgId: "org_1", inboxId: "ibx_1", messageCount: 2 },
    ]);
    const msg = (id: string, threadId: string, days: number) => ({
      id,
      orgId: "org_1",
      inboxId: "ibx_1",
      threadId,
      direction: "in" as const,
      status: "received" as const,
      text: "hello",
      rawKey: `raw/org_1/${id}.eml`,
      createdAt: daysAgo(days),
    });
    await db.insert(messages).values([msg("msg_gone", "thr_old", 40), msg("msg_scrub", "thr_new", 4), msg("msg_keep", "thr_new", 2)]);
    await db
      .insert(attachments)
      .values({ id: "att_1", orgId: "org_1", messageId: "msg_scrub", contentType: "text/plain", size: 1, blobKey: "att/1" });
    await db.insert(events).values([
      { id: "evt_old", orgId: "org_1", type: "message.received", payload: {}, createdAt: daysAgo(36) },
      { id: "evt_new", orgId: "org_1", type: "message.received", payload: {}, createdAt: daysAgo(1) },
    ]);

    const deleted: string[] = [];
    const r = await enforceRetention(db, now, { batchSize: 1, blobs: { delete: async (keys) => void deleted.push(...keys) } });
    expect(r).toEqual({
      scrubbed: 2,
      deleted: 1,
      threadsDeleted: 1,
      eventsDeleted: 1,
      deliveriesDeleted: 0,
      blobsDeleted: 3,
      complete: true,
    });
    expect(deleted.sort()).toEqual(["att/1", "raw/org_1/msg_gone.eml", "raw/org_1/msg_scrub.eml"]);
    const rows = await db.select({ id: messages.id, text: messages.text, scrubbedAt: messages.scrubbedAt }).from(messages);
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "msg_keep", text: "hello", scrubbedAt: null },
      { id: "msg_scrub", text: null, scrubbedAt: now },
    ]);
    expect((await db.select({ id: threads.id }).from(threads)).map((t) => t.id)).toEqual(["thr_new"]);
    expect((await db.select({ n: threads.messageCount }).from(threads).where(eq(threads.id, "thr_new")))[0]!.n).toBe(2);
  });
});
