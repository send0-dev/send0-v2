import { beforeAll, describe, expect, it } from "vitest";
import { snsStringToSign, verifySnsMessage } from "../src/sending/sns-signature";
import { canonical, createSnsSigner, type SnsTestSigner } from "./sns-signer";

const TOPIC = "arn:aws:sns:ap-south-1:1:send0-ses-events";
let signer: SnsTestSigner;
beforeAll(async () => {
  signer = await createSnsSigner();
});

const notification = (extra: Record<string, string> = {}) => ({
  Type: "Notification",
  TopicArn: TOPIC,
  Message: JSON.stringify({ eventType: "Delivery" }),
  ...extra,
});
const verify = (msg: unknown, opts: { now?: () => Date; certCache?: Map<string, CryptoKey> } = {}) =>
  verifySnsMessage(msg, { fetch: signer.fetch, certCache: new Map(), ...opts });
const reason = async (msg: unknown, opts?: Parameters<typeof verify>[1]) => {
  const r = await verify(msg, opts);
  return r.ok ? "ok" : r.reason;
};

describe("verifySnsMessage", () => {
  it("accepts Notification signatures v1 (SHA1) and v2 (SHA256)", async () => {
    expect(await verify(await signer.sign(notification(), { version: "1" }))).toEqual({ ok: true });
    expect(await verify(await signer.sign(notification(), { version: "2" }))).toEqual({ ok: true });
  });

  it("accepts signed SubscriptionConfirmation and UnsubscribeConfirmation", async () => {
    for (const Type of ["SubscriptionConfirmation", "UnsubscribeConfirmation"]) {
      const msg = await signer.sign({
        Type,
        TopicArn: TOPIC,
        Message: "You have chosen to subscribe",
        SubscribeURL: "https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&Token=t",
        Token: "t",
      });
      expect(await verify(msg)).toEqual({ ok: true });
      expect(await reason({ ...msg, Token: "other" })).toBe("signature_mismatch");
    }
  });

  it("includes Subject only when present", async () => {
    const base = { Message: "m", MessageId: "id", Timestamp: "2026-10-07T00:00:00.000Z", TopicArn: TOPIC, Type: "Notification" };
    expect(snsStringToSign(base)).toBe(
      "Message\nm\nMessageId\nid\nTimestamp\n2026-10-07T00:00:00.000Z\nTopicArn\n" + TOPIC + "\nType\nNotification\n",
    );
    expect(snsStringToSign({ ...base, Subject: "Hi" })).toBe(canonical({ ...base, Subject: "Hi" }));
    expect(snsStringToSign({ ...base, Subject: "Hi" })).toContain("MessageId\nid\nSubject\nHi\nTimestamp\n");

    const withSubject = await signer.sign(notification({ Subject: "Amazon SES Email Event Notification" }));
    expect(await verify(withSubject)).toEqual({ ok: true });
    const { Subject: _dropped, ...withoutSubject } = withSubject;
    expect(await reason(withoutSubject)).toBe("signature_mismatch");
    expect(await reason({ ...(await signer.sign(notification())), Subject: "added" })).toBe("signature_mismatch");
  });

  it("rejects a tampered Message", async () => {
    const msg = await signer.sign(notification());
    expect(await reason({ ...msg, Message: msg.Message!.replace("Delivery", "Bounce") })).toBe("signature_mismatch");
  });

  it("rejects a signature from another key", async () => {
    const other = await createSnsSigner();
    expect(await reason(await other.sign(notification()))).toBe("signature_mismatch");
  });

  it("rejects malformed signatures and missing fields", async () => {
    const msg = await signer.sign(notification());
    expect(await reason({ ...msg, Signature: "%%%" })).toBe("bad_signature_encoding");
    const { MessageId: _m, ...noId } = msg;
    expect(await reason(noId)).toBe("missing_field");
    expect(await reason({ ...msg, Type: "Other" })).toBe("unsupported_type");
    expect(await reason(null)).toBe("not_an_object");
    expect(await reason("x")).toBe("not_an_object");
  });

  it("rejects certificate URLs off SNS before fetching", async () => {
    const bad = [
      "https://sns.evil.com/SimpleNotificationService-abc.pem",
      "https://sns.ap-south-1.amazonaws.com.evil.com/SimpleNotificationService-abc.pem",
      "https://amazonaws.com.evil.com/x.pem",
      "http://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
      "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.txt",
      "https://sns.ap-south-1.amazonaws.com/x.pem?.pem",
      "https://user@sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
      "https://sns.ap-south-1.amazonaws.com:8443/SimpleNotificationService-abc.pem",
      "not a url",
    ];
    const before = signer.fetch.calls.length;
    for (const SigningCertURL of bad) {
      expect(await reason({ ...(await signer.sign(notification())), SigningCertURL }), SigningCertURL).toBe("bad_cert_url");
    }
    expect(signer.fetch.calls.length).toBe(before);
  });

  it("rejects unknown signature versions", async () => {
    const msg = await signer.sign(notification());
    for (const v of ["3", "", "02"]) expect(await reason({ ...msg, SignatureVersion: v })).toBe("unsupported_signature_version");
  });

  it("enforces the replay window", async () => {
    const msg = await signer.sign(notification({ Timestamp: "2026-10-07T12:00:00.000Z" }));
    const at = (iso: string) => ({ now: () => new Date(iso) });
    expect(await reason(msg, at("2026-10-07T12:59:00.000Z"))).toBe("ok");
    expect(await reason(msg, at("2026-10-07T13:00:01.000Z"))).toBe("expired");
    expect(await reason(msg, at("2026-10-07T11:56:00.000Z"))).toBe("ok");
    expect(await reason(msg, at("2026-10-07T11:54:59.000Z"))).toBe("timestamp_in_future");
    expect(await reason({ ...msg, Timestamp: "yesterday" })).toBe("bad_timestamp");
  });

  it("caches the imported key per URL and hash", async () => {
    const cache = new Map<string, CryptoKey>();
    const before = signer.fetch.calls.length;
    expect(await verify(await signer.sign(notification()), { certCache: cache })).toEqual({ ok: true });
    expect(await verify(await signer.sign(notification()), { certCache: cache })).toEqual({ ok: true });
    expect(signer.fetch.calls.length - before).toBe(1);
    expect(await verify(await signer.sign(notification(), { version: "1" }), { certCache: cache })).toEqual({ ok: true });
    expect(signer.fetch.calls.length - before).toBe(2);
  });

  it("bounds the cache", async () => {
    const cache = new Map<string, CryptoKey>();
    for (let i = 0; i < 25; i++) {
      const s = await createSnsSigner(`https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-${i}.pem`);
      expect(await verifySnsMessage(await s.sign(notification()), { fetch: s.fetch, certCache: cache })).toEqual({ ok: true });
    }
    expect(cache.size).toBeLessThanOrEqual(20);
  });

  it("fails closed when the certificate can't be fetched or parsed", async () => {
    const msg = await signer.sign(
      notification({ SigningCertURL: "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-gone.pem" }),
    );
    expect(await reason(msg)).toBe("cert_fetch_failed");
    const notPem = async () => new Response("<html>hi</html>");
    expect(await verifySnsMessage(await signer.sign(notification()), { fetch: notPem, certCache: new Map() })).toEqual({
      ok: false,
      reason: "bad_certificate",
    });
    const huge = async () => new Response("A".repeat(65 * 1024));
    expect(await verifySnsMessage(await signer.sign(notification()), { fetch: huge, certCache: new Map() })).toEqual({
      ok: false,
      reason: "cert_fetch_failed",
    });
    const throws = async (): Promise<Response> => {
      throw new Error("network down");
    };
    expect(await verifySnsMessage(await signer.sign(notification()), { fetch: throws, certCache: new Map() })).toEqual({
      ok: false,
      reason: "cert_fetch_failed",
    });
  });
});
