import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore } from "@send0/adapters/blob";
import { blobStoreFromEnv } from "../src/blobs";
import { handleEmail, MAX_MESSAGE_BYTES, rawKey, type InboundConfig, type InboundMessage } from "../src/handler";
import { checkRecipient } from "../src/recipient";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${name}`, import.meta.url).href));

function setup(opts: { to: string; raw?: Uint8Array; rawSize?: number; putFails?: boolean }) {
  const raw = opts.raw ?? fixture("gmail-reply.eml");
  const puts: { key: string; body: Uint8Array; options: any }[] = [];
  const env: InboundConfig = {
    MAIL_DOMAINS: "send0.email",
    ALLOWED_INBOXES: "test, kunal",
    TRUSTED_AUTHSERV_IDS: "mx.cloudflare.net",
  };
  const blobs: BlobStore = {
    put: vi.fn(async (key: string, body: Uint8Array, options: any) => {
      if (opts.putFails) throw new Error("S3 down");
      puts.push({ key, body, options });
    }),
  };
  const message: InboundMessage & { rejected?: string } = {
    from: "dana@gmail.com",
    to: opts.to,
    raw: new Response(raw).body!,
    rawSize: opts.rawSize ?? raw.byteLength,
    setReject(reason) {
      this.rejected = reason;
    },
  };
  return { env, blobs, message, puts };
}

const logs = () => vi.spyOn(console, "log").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe("checkRecipient", () => {
  const env = { MAIL_DOMAINS: "send0.email", ALLOWED_INBOXES: "test" };
  it.each([
    ["test@send0.email", true, undefined],
    ["Test+signup@Send0.Email", true, undefined],
    ["nobody@send0.email", false, "unknown"],
    ["postmaster@send0.email", false, "reserved"],
    ["test@other.com", false, "foreign_domain"],
    ["garbage", false, "invalid"],
  ])("%s", (to, ok, reason) => {
    const r = checkRecipient(to, env);
    expect(r.ok).toBe(ok);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("handleEmail", () => {
  it("stores the raw message, then logs the parsed summary", async () => {
    const log = logs();
    const { env, blobs, message, puts } = setup({ to: "Test+po4471@send0.email" });
    await handleEmail(message, env, blobs, new Date("2026-10-05T10:14:03Z"));

    expect(message.rejected).toBeUndefined();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toMatch(/^raw\/2026\/10\/05\/msg_[0-9A-Za-z]{16}\.eml$/);
    expect(puts[0]!.body.byteLength).toBe(fixture("gmail-reply.eml").byteLength);
    expect(puts[0]!.options.metadata).toMatchObject({ inbox: "test@send0.email", tag: "po4471", envelope_from: "dana@gmail.com" });

    const summary = JSON.parse(log.mock.calls.at(-1)![0] as string);
    expect(summary).toMatchObject({
      event: "message.received",
      inbox: "test@send0.email",
      tag: "po4471",
      raw_key: puts[0]!.key,
      in_reply_to: ["<msg_4Tq1aB9cD8eF7gH6@send0.email>"],
      auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
      safety: { promptInjection: "none" },
    });
    expect(summary.extracted_text).toBe("Can you confirm Thursday instead? Our dock is closed Wednesday.\n\nThanks,\nDana");
  });

  it("rejects unknown and reserved addresses without storing anything", async () => {
    logs();
    for (const to of ["nobody@send0.email", "abuse@send0.email"]) {
      const { env, blobs, message, puts } = setup({ to });
      await handleEmail(message, env, blobs);
      expect(message.rejected).toMatch(/^5\.1\.1 /);
      expect(puts).toHaveLength(0);
    }
  });

  it("rejects messages over 25 MiB before reading them", async () => {
    logs();
    const { env, blobs, message, puts } = setup({ to: "test@send0.email", rawSize: MAX_MESSAGE_BYTES + 1 });
    await handleEmail(message, env, blobs);
    expect(message.rejected).toBe("5.3.4 Message too big");
    expect(puts).toHaveLength(0);
  });

  it("keeps the message when parsing fails", async () => {
    logs();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const core = await import("@send0/core");
    vi.spyOn(core, "parseInbound").mockRejectedValueOnce(new Error("boom"));
    const { env, blobs, message, puts } = setup({ to: "test@send0.email" });
    await handleEmail(message, env, blobs);
    expect(message.rejected).toBeUndefined();
    expect(puts).toHaveLength(1);
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({ event: "message.parse_failed", error: "Error: boom" });
  });

  it("lets storage failures throw, so the sender retries instead of the mail being lost", async () => {
    logs();
    const { env, blobs, message } = setup({ to: "test@send0.email", putFails: true });
    await expect(handleEmail(message, env, blobs)).rejects.toThrow("S3 down");
  });
});

describe("rawKey", () => {
  it("partitions by UTC date", () => {
    expect(rawKey("msg_x", new Date("2026-01-02T23:59:59Z"))).toBe("raw/2026/01/02/msg_x.eml");
  });
});

describe("blobStoreFromEnv", () => {
  it("defaults to S3 and refuses a half-configured Worker", () => {
    expect(() => blobStoreFromEnv({ S3_BUCKET: "b", S3_REGION: "ap-south-1" })).toThrow(
      "BLOB_DRIVER=s3 but missing: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
    );
    expect(blobStoreFromEnv({ S3_BUCKET: "b", S3_REGION: "r", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" }).constructor.name).toBe("S3BlobStore");
  });
  it("uses R2 when asked and the binding exists", () => {
    expect(() => blobStoreFromEnv({ BLOB_DRIVER: "r2" })).toThrow(/RAW_MAIL binding is missing/);
    expect(blobStoreFromEnv({ BLOB_DRIVER: "r2", RAW_MAIL: {} as R2Bucket }).constructor.name).toBe("R2BlobStore");
  });
});
