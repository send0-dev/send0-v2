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
    expect(() => parseCoreConfig({})).toThrow("MAIL_DOMAINS: is required (comma-separated domains, like agents.acme.com)");
  });

  it("accepts booleans, any case and blanks for ALLOW_SIGNUP", () => {
    const get = (v: unknown, d?: boolean) => parseCoreConfig({ MAIL_DOMAINS: "a.dev", ALLOW_SIGNUP: v }, { allowSignup: d }).allowSignup;
    expect(get(false)).toBe(false);
    expect(get(true, false)).toBe(true);
    expect(get("TRUE", false)).toBe(true);
    expect(get(" false ")).toBe(false);
    expect(get("", false)).toBe(false);
    expect(get("  ")).toBe(true);
  });

  it("accepts any case and blanks for LIMITS and TRUSTED_AUTHSERV_IDS", () => {
    const base = { MAIL_DOMAINS: "a.dev" };
    expect(parseCoreConfig({ ...base, LIMITS: " NONE " }).limits).toEqual(NO_LIMITS);
    expect(parseCoreConfig({ ...base, LIMITS: "" }, { limits: "none" }).limits).toEqual(NO_LIMITS);
    expect(parseCoreConfig({ ...base, TRUSTED_AUTHSERV_IDS: " " }).trustedAuthservIds).toEqual([]);
  });

  it("collapses duplicate list entries, keeping first-seen order", () => {
    const c = parseCoreConfig({ MAIL_DOMAINS: "b.dev, a.dev, B.dev", TRUSTED_AUTHSERV_IDS: "x.a.dev,x.a.dev" });
    expect(c.mailDomains).toEqual(["b.dev", "a.dev"]);
    expect(c.trustedAuthservIds).toEqual(["x.a.dev"]);
  });

  it("accepts punycode TLDs and rejects single labels, IPs and trailing dots", () => {
    expect(parseCoreConfig({ MAIL_DOMAINS: "mail.xn--p1ai" }).mailDomains).toEqual(["mail.xn--p1ai"]);
    for (const bad of ["localhost", "a.com.", "1.2.3.4"]) expect(() => parseCoreConfig({ MAIL_DOMAINS: bad })).toThrow(/MAIL_DOMAINS/);
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
    expect((error as ConfigError).problems).toHaveLength(3);
    expect(problems).toContain("LIMITS: must be hosted or none");
    expect(problems).toContain("ALLOW_SIGNUP: must be true, false, 1 or 0");
  });
});
