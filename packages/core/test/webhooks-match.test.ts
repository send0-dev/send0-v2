import { describe, expect, it } from "vitest";
import { matchesFilter, newWebhookSecret, signWebhook, verifyWebhook } from "../src";

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';

  it("signs Stripe-style and verifies", async () => {
    const header = await signWebhook(secret, body, 1791190000);
    expect(header).toMatch(/^t=1791190000,v1=[0-9a-f]{64}$/);
    expect(await verifyWebhook(secret, body, header, { now: 1791190010 })).toBe(true);
  });

  it("matches a known HMAC", async () => {
    // HMAC-SHA256("whsec_test", "1791190000.{\"id\":\"evt_1\"}"), computed independently with openssl
    const header = await signWebhook(secret, body, 1791190000);
    expect(header.split("v1=")[1]).toBe("54ea7b7afa65b8ac6431cbd7018e475660476534c583d4c9b9c1f72cc0a71e1b");
  });

  it("rejects tampering, wrong secrets, stale timestamps and junk", async () => {
    const header = await signWebhook(secret, body, 1791190000);
    expect(await verifyWebhook(secret, body + " ", header, { now: 1791190000 })).toBe(false);
    expect(await verifyWebhook("whsec_other", body, header, { now: 1791190000 })).toBe(false);
    expect(await verifyWebhook(secret, body, header, { now: 1791190000 + 301 })).toBe(false);
    expect(await verifyWebhook(secret, body, "garbage", { now: 1791190000 })).toBe(false);
    expect(await verifyWebhook(secret, body, null)).toBe(false);
  });

  it("accepts any v1 during secret rotation", async () => {
    const good = (await signWebhook(secret, body, 1791190000)).split(",")[1];
    expect(await verifyWebhook(secret, body, `t=1791190000,v1=deadbeef,${good}`, { now: 1791190000 })).toBe(true);
  });

  it("makes long random secrets", () => {
    expect(newWebhookSecret()).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
  });
});

describe("matchesFilter", () => {
  const m = { direction: "in", from: { email: "noreply@acme.dev" }, subject: "Your Acme verification code" };
  it.each([
    [{}, true],
    [{ from: "*@acme.dev" }, true],
    [{ from: "NOREPLY@ACME.DEV" }, true],
    [{ from: "*@acme.com" }, false],
    [{ from: "*.dev" }, true],
    [{ from: "noreply@acme.dev.evil.com" }, false],
    [{ subject: "VERIFICATION" }, true],
    [{ subject: "invoice" }, false],
    [{ direction: "out" as const }, false],
    [{ from: "*@acme.dev", subject: "code", direction: "in" as const }, true],
  ])("%j → %s", (f, expected) => expect(matchesFilter(m, f)).toBe(expected));

  it("treats regex characters in patterns literally", () => {
    expect(matchesFilter({ ...m, from: { email: "aXb@x.io" } }, { from: "a.b@x.io" })).toBe(false);
  });
});
