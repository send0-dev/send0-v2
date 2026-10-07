import { FsBlobStore } from "@send0/adapters/node/fs-blob";
import { HOSTED_LIMITS } from "@send0/config";
import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { eq, inArray, isNull } from "drizzle-orm";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Message } from "../src/openapi/schemas";
import { enforceRetention, raiseSendCaps, RETENTION } from "../src/maintenance";
import { checkSendPolicy } from "../src/sending/policy";
import { maybePauseSending } from "../src/sending/ses-events";
import type { AppDeps } from "../src/types";
import { setup, type TestEnv } from "./helpers";

const { messages, attachments, threads, inboxes, orgs, events, deliveries, webhooks } = schema;

let t: TestEnv;
beforeEach(async () => {
  t = await setup();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
type Status = typeof messages.$inferInsert.status;

async function inbox(opts: { retentionDays?: number; orgId?: string } = {}) {
  const id = newId("ibx");
  await t.db.insert(inboxes).values({
    id,
    orgId: opts.orgId ?? t.orgId,
    domainId: "dom_shared",
    localPart: id.toLowerCase(),
    ...(opts.retentionDays ? { retentionDays: opts.retentionDays } : {}),
  });
  const threadId = await thread(id, opts.orgId);
  return { id, threadId };
}

async function thread(inboxId: string, orgId = t.orgId) {
  const id = newId("thr");
  await t.db.insert(threads).values({ id, orgId, inboxId, subject: "Your code", messageCount: 0 });
  return id;
}

/** A message `days` old with a body, extracted fields, a raw key and one attachment row. */
async function message(
  box: { id: string; threadId: string },
  days: number,
  opts: { direction?: "in" | "out"; status?: Status; orgId?: string; threadId?: string } = {},
) {
  const id = newId("msg");
  const orgId = opts.orgId ?? t.orgId;
  await t.db.insert(messages).values({
    id,
    orgId,
    inboxId: box.id,
    threadId: opts.threadId ?? box.threadId,
    direction: opts.direction ?? "in",
    status: opts.status ?? (opts.direction === "out" ? "delivered" : "received"),
    rfcMessageId: `<${id}@acme.dev>`,
    from: { name: "Dana", email: "dana@acme.dev" },
    to: [{ name: null, email: "agent@send0.email" }],
    subject: "Your code",
    text: "Your code is 482913",
    html: "<p>Your code is <b>482913</b></p>",
    extractedText: "Your code is 482913",
    extracted: { otp: "482913", links: ["https://acme.dev/v"], actionLink: "https://acme.dev/v" },
    auth: { spf: "pass", dkim: "pass", dmarc: "pass", source: "mx.cloudflare.net" },
    size: 1234,
    rawKey: `raw/${orgId}/${id}.eml`,
    receivedAt: daysAgo(days),
    createdAt: daysAgo(days),
  });
  await t.db.insert(attachments).values({
    id: newId("att"),
    orgId,
    messageId: id,
    filename: "invoice.pdf",
    contentType: "application/pdf",
    size: 10,
    blobKey: `att/${orgId}/${id}/invoice.pdf`,
  });
  return id;
}

const row = async (id: string) => (await t.db.select().from(messages).where(eq(messages.id, id)))[0];
const attachmentCount = async (id: string) => (await t.db.select().from(attachments).where(eq(attachments.messageId, id))).length;

describe("retention: scrubbing", () => {
  it("scrubs content past each inbox's retention_days and keeps routing and status", async () => {
    const week = await inbox(); // default 7
    const month = await inbox({ retentionDays: 30 });
    const old7 = await message(week, 8);
    const fresh7 = await message(week, 6);
    const kept30 = await message(month, 20);
    const old30 = await message(month, 31);

    const r = await enforceRetention(t.db, now);
    expect(r).toMatchObject({ scrubbed: 2, deleted: 0, complete: true });

    for (const id of [old7, old30]) {
      const m = (await row(id))!;
      expect(m).toMatchObject({
        text: null,
        html: null,
        extractedText: null,
        extracted: null,
        rawKey: null,
        scrubbedAt: now,
        // Kept: what reputation, reply-only and threading read
        direction: "in",
        status: "received",
        from: { name: "Dana", email: "dana@acme.dev" },
        to: [{ name: null, email: "agent@send0.email" }],
        subject: "Your code",
        rfcMessageId: `<${id}@acme.dev>`,
        auth: { spf: "pass", dkim: "pass", dmarc: "pass", source: "mx.cloudflare.net" },
        size: 1234,
      });
      expect(await attachmentCount(id)).toBe(0);
    }
    for (const id of [fresh7, kept30]) {
      expect(await row(id)).toMatchObject({ text: "Your code is 482913", scrubbedAt: null, rawKey: expect.any(String) });
      expect(await attachmentCount(id)).toBe(1);
    }

    // A second run has nothing to do.
    expect(await enforceRetention(t.db, now)).toMatchObject({ scrubbed: 0, deleted: 0, complete: true });
  });

  it("treats retention_days above 30 (set before the cap) as 30", async () => {
    const legacy = await inbox({ retentionDays: 90 });
    const id = await message(legacy, 31);
    await enforceRetention(t.db, now);
    expect((await row(id))!.scrubbedAt).toEqual(now);
  });

  it("keeps reputation, pause and reply-only decisions the same after a scrub", async () => {
    // Reply-only: the free plan may reply to dana@acme.dev because she wrote first, even after her mail is scrubbed.
    const box = await inbox({ retentionDays: 1 });
    await message(box, 3);

    // Raising caps: a busy, clean week; pausing: a second org with 2 hard bounces in 20 (10%).
    const clean = newId("org");
    const bouncy = newId("org");
    await t.db.insert(orgs).values([
      { id: clean, name: "clean", createdAt: daysAgo(40) },
      { id: bouncy, name: "bouncy", createdAt: daysAgo(40) },
    ]);
    const cleanBox = await inbox({ orgId: clean, retentionDays: 1 });
    const bouncyBox = await inbox({ orgId: bouncy, retentionDays: 1 });
    for (let i = 0; i < 45; i++) await message(cleanBox, 2, { direction: "out", orgId: clean });
    for (let i = 0; i < 18; i++) await message(bouncyBox, 5, { direction: "out", orgId: bouncy });
    for (let i = 0; i < 2; i++) await message(bouncyBox, 10, { direction: "out", status: "bounced", orgId: bouncy });

    const r = await enforceRetention(t.db, now);
    expect(r.scrubbed).toBe(1 + 45 + 20);

    const [org] = await t.db.select().from(orgs).where(eq(orgs.id, t.orgId));
    const [ibx] = await t.db.select().from(inboxes).where(eq(inboxes.id, box.id));
    await expect(
      checkSendPolicy(t.db, {
        org: org!,
        inbox: ibx!,
        recipients: ["dana@acme.dev"],
        now,
        mailDomains: ["send0.email"],
        limits: HOSTED_LIMITS,
      }),
    ).resolves.toBeUndefined();

    expect(await raiseSendCaps(t.db, now)).toEqual([{ orgId: clean, from: 50, to: 100 }]);
    expect(await maybePauseSending({ db: t.db } as AppDeps, bouncy, bouncyBox.id, now)).toBe(true);
  });
});

describe("retention: deleting", () => {
  it("deletes rows after 35 days, then threads left empty, and recounts the rest", async () => {
    const box = await inbox();
    const goneThread = box.threadId;
    const mixedThread = await thread(box.id);
    const doomed = await message(box, 36);
    const doomedToo = await message(box, 40, { threadId: mixedThread });
    const survivor = await message(box, 34, { threadId: mixedThread });
    await t.db.update(threads).set({ messageCount: 2 }).where(eq(threads.id, mixedThread));

    const r = await enforceRetention(t.db, now);
    // All three are past 7 days (scrubbed first), two past 35 days (deleted).
    expect(r).toMatchObject({ scrubbed: 3, deleted: 2, threadsDeleted: 1, complete: true });
    expect(
      await t.db
        .select()
        .from(messages)
        .where(inArray(messages.id, [doomed, doomedToo, survivor])),
    ).toHaveLength(1);
    expect(await t.db.select().from(threads).where(eq(threads.id, goneThread))).toEqual([]);
    const [mixed] = await t.db.select().from(threads).where(eq(threads.id, mixedThread));
    expect(mixed!.messageCount).toBe(1);
  });

  it("prunes outbox events and webhook deliveries older than 35 days", async () => {
    const [hook] = await t.db
      .insert(webhooks)
      .values({ id: newId("whk"), orgId: t.orgId, url: "https://hooks.test/x", secret: "s", events: ["*"] })
      .returning();
    const add = async (days: number) => {
      const eventId = newId("evt");
      await t.db.insert(events).values({ id: eventId, orgId: t.orgId, type: "message.received", payload: {}, createdAt: daysAgo(days) });
      await t.db.insert(deliveries).values({ id: newId("dlv"), orgId: t.orgId, webhookId: hook!.id, eventId, createdAt: daysAgo(days) });
      return eventId;
    };
    const old = await add(36);
    const recent = await add(30);
    const r = await enforceRetention(t.db, now);
    expect(r).toMatchObject({ eventsDeleted: 1, deliveriesDeleted: 1 });
    expect((await t.db.select({ id: events.id }).from(events)).map((e) => e.id)).toEqual([recent]);
    expect(await t.db.select().from(deliveries).where(eq(deliveries.eventId, old))).toEqual([]);
    expect(await t.db.select().from(deliveries)).toHaveLength(1);
  });
});

describe("retention: the API", () => {
  it("returns a scrubbed message with expired: true and refuses its raw download and forwards", async () => {
    const box = await inbox();
    const id = await message(box, 10);
    const fresh = await message(box, 1);
    await enforceRetention(t.db, now);

    const r = await t.call("GET", `/v1/messages/${id}`);
    expect(r.status).toBe(200);
    expect(Message.safeParse(r.body).success).toBe(true);
    expect(r.body).toMatchObject({
      id,
      expired: true,
      direction: "in",
      status: "received",
      from: { name: "Dana", email: "dana@acme.dev" },
      subject: "Your code",
      text: null,
      html: null,
      extracted_text: null,
      extracted: null,
      attachments: [],
      size: 1234,
    });
    expect((await t.call("GET", `/v1/messages/${fresh}`)).body).toMatchObject({ expired: false, text: "Your code is 482913" });

    const raw = await t.call("GET", `/v1/messages/${id}/raw`);
    expect(raw.status).toBe(410);
    expect(raw.body.error.code).toBe("message_expired");
    const fwd = await t.call("POST", `/v1/messages/${id}/forward`, { body: { to: ["kim@acme.dev"] } });
    expect(fwd.status).toBe(410);

    const thr = await t.call("GET", `/v1/inboxes/${box.id}/threads/${box.threadId}`);
    expect(thr.body.messages.map((m: { expired: boolean }) => m.expired)).toEqual([true, false]);
  });

  it("accepts retention_days from 1 to 30 and rejects anything longer", async () => {
    const created = await t.call("POST", "/v1/inboxes", { body: { name: "short-memory", retention_days: 2 } });
    expect(created.status).toBe(201);
    expect(created.body.retention_days).toBe(2);
    expect((await t.call("POST", "/v1/inboxes", { body: {} })).body.retention_days).toBe(7);

    const tooLong = await t.call("POST", "/v1/inboxes", { body: { retention_days: 31 } });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.param).toBe("retention_days");
    expect((await t.call("POST", "/v1/inboxes", { body: { retention_days: 0 } })).status).toBe(400);

    const id = created.body.id as string;
    expect((await t.call("PATCH", `/v1/inboxes/${id}`, { body: { retention_days: RETENTION.maxDays } })).body.retention_days).toBe(30);
    expect((await t.call("PATCH", `/v1/inboxes/${id}`, { body: { retention_days: 90 } })).status).toBe(400);
  });
});

describe("retention: blobs and batches", () => {
  it("deletes raw mail and attachments from a store that can delete", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "send0-retention-"));
    try {
      const store = new FsBlobStore(dir);
      const box = await inbox();
      const old = await message(box, 8);
      const fresh = await message(box, 1);
      for (const id of [old, fresh]) {
        await store.put(`raw/${t.orgId}/${id}.eml`, new Uint8Array(3), { contentType: "message/rfc822" });
        await store.put(`att/${t.orgId}/${id}/invoice.pdf`, new Uint8Array(3), { contentType: "application/pdf" });
      }
      const r = await enforceRetention(t.db, now, { blobs: store });
      expect(r).toMatchObject({ scrubbed: 1, blobsDeleted: 2 });
      expect(await store.get(`raw/${t.orgId}/${old}.eml`)).toBeNull();
      expect(await store.get(`att/${t.orgId}/${old}/invoice.pdf`)).toBeNull();
      expect(await store.get(`raw/${t.orgId}/${fresh}.eml`)).not.toBeNull();
      expect(await readdir(path.join(dir, "att", t.orgId, fresh))).toEqual(["invoice.pdf", "invoice.pdf.meta.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves rows untouched when deleting their blobs fails, so the next run retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const box = await inbox();
    const id = await message(box, 8);
    const r = await enforceRetention(t.db, now, { blobs: { delete: () => Promise.reject(new Error("disk gone")) } });
    expect(r).toMatchObject({ scrubbed: 0, complete: false });
    expect(await row(id)).toMatchObject({ scrubbedAt: null, rawKey: `raw/${t.orgId}/${id}.eml` });
    expect(await attachmentCount(id)).toBe(1);
  });

  it("works in batches and stops when the time budget runs out", async () => {
    const box = await inbox();
    for (let i = 0; i < 5; i++) await message(box, 8 + i);

    // The deadline is the first clock read plus 25 ms, and each read advances 10 ms: two batches start, the third doesn't.
    let ms = 0;
    const clock = () => (ms += 10);
    const first = await enforceRetention(t.db, now, { batchSize: 2, timeBudgetMs: 25, clock });
    expect(first).toMatchObject({ scrubbed: 4, complete: false });
    // Oldest first: the newest (8 days old) is the one left.
    const left = await t.db.select({ createdAt: messages.createdAt }).from(messages).where(isNull(messages.scrubbedAt));
    expect(left).toEqual([{ createdAt: daysAgo(8) }]);

    const second = await enforceRetention(t.db, now, { batchSize: 2 });
    expect(second).toMatchObject({ scrubbed: 1, complete: true });

    // Without a budget problem, a small batch size still gets through everything in one run.
    for (let i = 0; i < 5; i++) await message(box, 9);
    expect(await enforceRetention(t.db, now, { batchSize: 2 })).toMatchObject({ scrubbed: 5, complete: true });
  });
});
