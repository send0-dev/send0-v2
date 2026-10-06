import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "../src";
import { createTestDb } from "../src/testing";

const { orgs, domains, inboxes, threads, messages } = schema;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(orgs).values({ id: "org_1", name: "Acme" });
  await db.insert(domains).values({ id: "dom_shared", name: "send0.email", kind: "shared", status: "verified" });
  await db.insert(inboxes).values({ id: "ibx_1", orgId: "org_1", domainId: "dom_shared", localPart: "Bot" });
  await db.insert(threads).values({ id: "thr_1", orgId: "org_1", inboxId: "ibx_1", subject: "Hello" });
});
afterAll(() => close());

const message = (id: string, extra: Partial<typeof messages.$inferInsert> = {}) => ({
  id,
  orgId: "org_1",
  inboxId: "ibx_1",
  threadId: "thr_1",
  direction: "in" as const,
  status: "received" as const,
  ...extra,
});

describe("schema", () => {
  it("applies defaults", async () => {
    const [ibx] = await db.select().from(inboxes).where(eq(inboxes.id, "ibx_1"));
    expect(ibx).toMatchObject({ mode: "live", sendPolicy: "reply_only", status: "active", retentionDays: 7, metadata: {} });
  });

  it("treats addresses case-insensitively and never reuses them", async () => {
    await expect(
      db.insert(inboxes).values({ id: "ibx_2", orgId: "org_1", domainId: "dom_shared", localPart: "bot" }),
    ).rejects.toThrow();
  });

  it("de-duplicates inbound mail by Message-ID, but not outbound", async () => {
    await db.insert(messages).values(message("msg_1", { rfcMessageId: "<a@x>" }));
    await expect(db.insert(messages).values(message("msg_2", { rfcMessageId: "<a@x>" }))).rejects.toThrow();
    await db.insert(messages).values(message("msg_3", { rfcMessageId: "<a@x>", direction: "out", status: "queued" }));
    await db.insert(messages).values(message("msg_4"));
    await db.insert(messages).values(message("msg_5"));
  });

  it("maintains the full-text search column", async () => {
    await db.insert(messages).values(message("msg_6", { subject: "Purchase order", extractedText: "Delivery on Thursday works" }));
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.inboxId, "ibx_1"), sql`${messages.tsv} @@ plainto_tsquery('simple', 'thursday')`));
    expect(rows).toEqual([{ id: "msg_6" }]);
  });

  it("stores arrays and JSON", async () => {
    await db.insert(messages).values(
      message("msg_7", {
        references: ["<a@x>", "<b@y>"],
        from: { name: "Dana", email: "dana@acme.com" },
        extracted: { otp: "482913", links: [], actionLink: null },
      }),
    );
    const [row] = await db.select().from(messages).where(eq(messages.id, "msg_7"));
    expect(row!.references).toEqual(["<a@x>", "<b@y>"]);
    expect(row!.from).toEqual({ name: "Dana", email: "dana@acme.com" });
    expect(row!.extracted?.otp).toBe("482913");
  });
});
