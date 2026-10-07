import type { BlobStore } from "@send0/adapters/blob";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkRecipient, MAX_MESSAGE_BYTES, rawKey, receiveMessage, type InboundMessage } from "../src";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${name}`, import.meta.url).href));

const cfg = { mailDomains: ["send0.email"], trustedAuthservIds: ["mx.cloudflare.net"] };
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.orgs).values({ id: "org_1", name: "Acme" });
  await db.insert(schema.domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
  await db.insert(schema.inboxes).values([
    { id: "ibx_test", orgId: "org_1", domainId: "dom_1", localPart: "test" },
    { id: "ibx_off", orgId: "org_1", domainId: "dom_1", localPart: "paused", status: "suspended" },
  ]);
});
afterAll(() => close());
afterEach(() => vi.restoreAllMocks());

function setup(opts: { to: string; raw?: Uint8Array; rawSize?: number; putFails?: boolean }) {
  const raw = opts.raw ?? fixture("gmail-reply.eml");
  const puts: { key: string; body: Uint8Array; options: any }[] = [];
  const blobs: BlobStore = {
    put: async (key, body, options) => {
      if (opts.putFails) throw new Error("S3 down");
      puts.push({ key, body, options });
    },
  };
  const message: InboundMessage & { rejected?: string } = {
    from: "dana@gmail.com",
    to: opts.to,
    raw: new Blob([new Uint8Array(raw)]).stream(),
    rawSize: opts.rawSize ?? raw.byteLength,
    setReject(reason) {
      this.rejected = reason;
    },
  };
  return { deps: { db, blobs }, message, puts };
}

const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("checkRecipient", () => {
  it.each([
    ["test@send0.email", true, undefined],
    ["Test+signup@Send0.Email", true, undefined],
    ["postmaster@send0.email", false, "reserved"],
    ["test@other.com", false, "foreign_domain"],
    ["garbage", false, "invalid"],
  ])("%s", (to, ok, reason) => {
    const r = checkRecipient(to, cfg.mailDomains);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("receiveMessage", () => {
  it("stores raw mail first, then ingests it into the inbox", async () => {
    quiet();
    const { deps, message, puts } = setup({ to: "Test+po4471@send0.email" });
    const r = await receiveMessage(message, cfg, deps, new Date("2026-10-05T10:14:03Z"));

    expect(message.rejected).toBeUndefined();
    expect(puts[0]!.key).toMatch(/^raw\/org_1\/2026\/10\/05\/msg_[0-9A-Za-z]{16}\.eml$/);
    expect(puts[0]!.options.metadata).toMatchObject({ inbox_id: "ibx_test", tag: "po4471", envelope_from: "dana@gmail.com" });
    if (!r || r.duplicate) throw new Error("expected a new message");

    const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, r.messageId));
    expect(msg).toMatchObject({ inboxId: "ibx_test", tag: "po4471", rawKey: puts[0]!.key, direction: "in" });
    expect(msg!.extractedText).toBe("Can you confirm Thursday instead? Our dock is closed Wednesday.\n\nThanks,\nDana");
  });

  it("publishes new messages to the inbox and org hubs and the webhook queue", async () => {
    quiet();
    const notified: { name: string; id: string }[] = [];
    const queued: unknown[] = [];
    const hub = {
      idFromName: (name: string) => name,
      get: (name: never) => ({ notify: async (e: { id: string }) => void notified.push({ name, id: e.id }) }),
    };
    const { deps, message } = setup({ to: "test@send0.email", raw: fixture("otp-html-only.eml") });
    const r = await receiveMessage(message, cfg, { ...deps, hub, queue: { send: async (m) => void queued.push(m) } });
    if (!r || r.duplicate) throw new Error("expected new message");
    expect(notified).toEqual([
      { name: "org:org_1", id: r.envelope.id },
      { name: "inbox:ibx_test", id: r.envelope.id },
    ]);
    expect(queued).toEqual([{ kind: "fanout", eventId: r.envelope.id }]);
  });

  it("publishes through the publish hook instead of the hub and queue when one is given", async () => {
    quiet();
    const published: { orgId: string; id: string }[] = [];
    const hub = { idFromName: (n: string) => n, get: () => ({ notify: vi.fn(async () => {}) }) };
    const queue = { send: vi.fn(async () => {}) };
    const { deps, message } = setup({ to: "test@send0.email", raw: fixture("apple-mail-reply.eml") });
    const r = await receiveMessage(message, cfg, {
      ...deps,
      hub,
      queue,
      publish: async (orgId, envelope) => void published.push({ orgId, id: envelope.id }),
    });
    if (!r || r.duplicate) throw new Error("expected new message");
    expect(published).toEqual([{ orgId: "org_1", id: r.envelope.id }]);
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("still accepts mail when publishing fails", async () => {
    quiet();
    const hub = { idFromName: (n: string) => n, get: () => ({ notify: async () => Promise.reject(new Error("DO down")) }) };
    const { deps, message } = setup({ to: "test@send0.email", raw: fixture("forwarded.eml") });
    const r = await receiveMessage(message, cfg, { ...deps, hub, queue: { send: async () => Promise.reject(new Error("queue down")) } });
    expect(r?.duplicate).toBe(false);
    expect(message.rejected).toBeUndefined();
  });

  it("treats a retried delivery as a duplicate", async () => {
    quiet();
    const { deps, message } = setup({ to: "test@send0.email" });
    const r = await receiveMessage(message, cfg, deps);
    expect(r?.duplicate).toBe(true);
  });

  it("refuses unknown, reserved and suspended inboxes without storing anything", async () => {
    quiet();
    for (const [to, smtp] of [
      ["nobody@send0.email", /^5\.1\.1 Mailbox does not exist/],
      ["abuse@send0.email", /^5\.1\.1 /],
      ["paused@send0.email", /^5\.2\.1 Mailbox disabled/],
    ] as const) {
      const { deps, message, puts } = setup({ to });
      await receiveMessage(message, cfg, deps);
      expect(message.rejected).toMatch(smtp);
      expect(puts).toHaveLength(0);
    }
  });

  it("rejects messages over 25 MiB before reading them", async () => {
    quiet();
    const { deps, message, puts } = setup({ to: "test@send0.email", rawSize: MAX_MESSAGE_BYTES + 1 });
    await receiveMessage(message, cfg, deps);
    expect(message.rejected).toBe("5.3.4 Message too big");
    expect(puts).toHaveLength(0);
  });

  it("keeps the raw message when parsing fails", async () => {
    quiet();
    const core = await import("@send0/core");
    vi.spyOn(core, "parseInbound").mockRejectedValueOnce(new Error("boom"));
    const { deps, message, puts } = setup({ to: "test@send0.email", raw: fixture("magic-link.eml") });
    expect(await receiveMessage(message, cfg, deps)).toBeNull();
    expect(message.rejected).toBeUndefined();
    expect(puts).toHaveLength(1);
  });

  it("lets storage failures throw, so the sender retries instead of the mail being lost", async () => {
    quiet();
    const { deps, message } = setup({ to: "test@send0.email", putFails: true, raw: fixture("otp-subject.eml") });
    await expect(receiveMessage(message, cfg, deps)).rejects.toThrow("S3 down");
  });
});

describe("rawKey", () => {
  it("partitions by org and UTC date", () => {
    expect(rawKey("org_1", "msg_x", new Date("2026-01-02T23:59:59Z"))).toBe("raw/org_1/2026/01/02/msg_x.eml");
  });
});
