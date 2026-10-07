import type { BlobStore } from "@send0/adapters/blob";
import { newId, parseInbound } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { count, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findInboxByAddress, ingestMessage, type InboxRecord } from "../src";

const fixture = (n: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${n}`, import.meta.url).href));
const parse = (n: string) => parseInbound(fixture(n), { trustedAuthservIds: ["mx.cloudflare.net"] });

let db: Db;
let close: () => Promise<void>;
let inbox: InboxRecord;
const puts: { key: string; size: number; contentType: string }[] = [];
const blobs: BlobStore = { put: async (key, body, opts) => void puts.push({ key, size: body.byteLength, contentType: opts.contentType }) };

const ingest = async (name: string, at = new Date("2026-10-05T10:00:00Z")) => {
  const id = newId("msg");
  return ingestMessage(db, blobs, {
    inbox,
    messageId: id,
    rawKey: `raw/x/${id}.eml`,
    parsed: await parse(name),
    tag: null,
    receivedAt: at,
  });
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.orgs).values({ id: "org_1", name: "Acme" });
  await db.insert(schema.domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
  await db.insert(schema.inboxes).values({ id: "ibx_1", orgId: "org_1", domainId: "dom_1", localPart: "procurement-agent" });
  inbox = (await findInboxByAddress(db, "Procurement-Agent", "SEND0.email"))!;
});
afterAll(() => close());

describe("findInboxByAddress", () => {
  it("matches case-insensitively and ignores deleted inboxes", async () => {
    expect(inbox).toMatchObject({ id: "ibx_1", orgId: "org_1", address: "procurement-agent@send0.email", status: "active" });
    expect(await findInboxByAddress(db, "nobody", "send0.email")).toBeNull();
    await db
      .insert(schema.inboxes)
      .values({ id: "ibx_gone", orgId: "org_1", domainId: "dom_1", localPart: "gone", status: "deleted", deletedAt: new Date() });
    expect(await findInboxByAddress(db, "gone", "send0.email")).toBeNull();
  });
});

describe("ingestMessage", () => {
  it("threads a reply onto the outbound message it answers (In-Reply-To)", async () => {
    await db.insert(schema.threads).values({
      id: "thr_po",
      orgId: "org_1",
      inboxId: "ibx_1",
      subject: "PO #4471 delivery date",
      subjectNorm: "po #4471 delivery date",
      messageCount: 1,
      participants: ["dana@gmail.com"],
    });
    await db.insert(schema.messages).values({
      id: "msg_out",
      orgId: "org_1",
      inboxId: "ibx_1",
      threadId: "thr_po",
      direction: "out",
      status: "sent",
      rfcMessageId: "<msg_4Tq1aB9cD8eF7gH6@send0.email>",
      subject: "PO #4471 delivery date",
    });

    const r = await ingest("gmail-reply.eml");
    expect(r).toMatchObject({ duplicate: false, threadId: "thr_po", threadMatchedBy: "in-reply-to" });
    const [thread] = await db.select().from(schema.threads).where(eq(schema.threads.id, "thr_po"));
    expect(thread!.messageCount).toBe(2);
    expect(thread!.participants).toEqual(["dana@gmail.com"]);
  });

  it("ignores a second delivery of the same message", async () => {
    const before = await db.select({ n: count() }).from(schema.events);
    const r = await ingest("gmail-reply.eml");
    expect(r.duplicate).toBe(true);
    const after = await db.select({ n: count() }).from(schema.events);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("starts a new thread for a new conversation, and records the event and usage", async () => {
    const r = await ingest("otp-html-only.eml");
    if (r.duplicate) throw new Error("unexpected duplicate");
    expect(r.threadMatchedBy).toBeNull();
    const [evt] = await db.select().from(schema.events).where(eq(schema.events.id, r.event.id));
    expect(evt).toMatchObject({ type: "message.received", orgId: "org_1", inboxId: "ibx_1" });
    const data = (evt!.payload as any).data;
    expect(data).toMatchObject({ object: "message", id: r.messageId, thread_id: r.threadId, direction: "in", status: "received" });
    expect(data.extracted.otp).toBe("482913");
    expect(data.html).toBeUndefined();
    const [u] = await db.select().from(schema.usage).where(eq(schema.usage.orgId, "org_1"));
    expect(u!.received).toBe(2);
  });

  it("stores attachments in blob storage and links them to the message", async () => {
    const r = await ingest("attachment-pdf.eml");
    const rows = await db.select().from(schema.attachments).where(eq(schema.attachments.messageId, r.messageId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ filename: "price-list.pdf", contentType: "application/pdf", inline: false });
    expect(rows[0]!.blobKey).toBe(`att/org_1/${r.messageId}/${rows[0]!.id}`);
    expect(puts.find((p) => p.key === rows[0]!.blobKey)).toMatchObject({ contentType: "application/pdf" });
  });

  it("falls back to subject + participant threading when headers are missing", async () => {
    const raw = (subject: string, id: string) =>
      new TextEncoder().encode(
        `From: Lee <lee@contoso.com>\nTo: procurement-agent@send0.email\nSubject: ${subject}\nMessage-ID: <${id}@contoso.com>\nDate: Mon, 5 Oct 2026 10:00:00 +0000\n\nhello\n`,
      );
    const p1 = await parseInbound(raw("Shipping schedule", "s1"), { trustedAuthservIds: [] });
    const p2 = await parseInbound(raw("RE: Shipping schedule", "s2"), { trustedAuthservIds: [] });
    const at = new Date("2026-10-05T11:00:00Z");
    const a = await ingestMessage(db, blobs, { inbox, messageId: newId("msg"), rawKey: "raw/a", parsed: p1, tag: null, receivedAt: at });
    const b = await ingestMessage(db, blobs, {
      inbox,
      messageId: newId("msg"),
      rawKey: "raw/b",
      parsed: p2,
      tag: "task42",
      receivedAt: new Date(at.getTime() + 60_000),
    });
    if (a.duplicate || b.duplicate) throw new Error("unexpected duplicate");
    expect(b).toMatchObject({ threadId: a.threadId, threadMatchedBy: "subject" });
    const [m] = await db.select().from(schema.messages).where(eq(schema.messages.id, b.messageId));
    expect(m!.tag).toBe("task42");
  });
});
