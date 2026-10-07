import { describe, expect, it } from "vitest";
import { ConfigError, HOSTED_LIMITS, NO_LIMITS, parseCoreConfig } from "../src";

describe("parseCoreConfig", () => {
  it("reads mail domains as a trimmed, lowercase list", () => {
    expect(parseCoreConfig({ MAIL_DOMAINS: " Send0.email, agents.ACME.com ," }).mailDomains).toEqual(["send0.email", "agents.acme.com"]);
  });

  it("defaults to hosted limits, open sign-up and no trusted authserv-ids", () => {
    const c = parseCoreConfig({ MAIL_DOMAINS: "send0.email" });
    expect(c.limits).toEqual(HOSTED_LIMITS);
    expect(c.allowSignup).toBe(true);
    expect(c.trustedAuthservIds).toEqual([]);
  });

  it("reads trusted authserv-ids", () => {
    expect(parseCoreConfig({ MAIL_DOMAINS: "a.dev", TRUSTED_AUTHSERV_IDS: "mx.cloudflare.net, mx.a.dev" }).trustedAuthservIds).toEqual([
      "mx.cloudflare.net",
      "mx.a.dev",
    ]);
  });

  it("lets a runtime choose its defaults, and explicit env still wins", () => {
    const selfHost = { limits: "none", allowSignup: false } as const;
    expect(parseCoreConfig({ MAIL_DOMAINS: "a.dev" }, selfHost)).toMatchObject({ limits: NO_LIMITS, allowSignup: false });
    expect(parseCoreConfig({ MAIL_DOMAINS: "a.dev", LIMITS: "hosted", ALLOW_SIGNUP: "true" }, selfHost)).toMatchObject({
      limits: HOSTED_LIMITS,
      allowSignup: true,
    });
  });

  it("ignores unrelated env entries such as Worker bindings", () => {
    expect(parseCoreConfig({ MAIL_DOMAINS: "a.dev", HYPERDRIVE: { connectionString: "x" } }).mailDomains).toEqual(["a.dev"]);
  });

  it("requires MAIL_DOMAINS", () => {
    expect(() => parseCoreConfig({})).toThrow(/MAIL_DOMAINS/);
  });

  it("lists every problem at once", () => {
    let error: unknown;
    try {
      parseCoreConfig({ MAIL_DOMAINS: "not a domain", LIMITS: "some", ALLOW_SIGNUP: "yes" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const problems = (error as ConfigError).problems.join("\n");
    expect(problems).toMatch(/MAIL_DOMAINS/);
    expect(problems).toMatch(/LIMITS/);
    expect(problems).toMatch(/ALLOW_SIGNUP/);
  });
});
