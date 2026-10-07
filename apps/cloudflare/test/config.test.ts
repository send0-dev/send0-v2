import { describe, expect, it, vi } from "vitest";
import { configCache, configErrorResponse, ConfigError, loadConfig } from "../src/config";
import { VARS } from "./support";

const problemsOf = (env: object): string[] => {
  try {
    loadConfig(env);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
};

describe("loadConfig", () => {
  it("applies the Cloudflare edition's defaults", () => {
    const c = loadConfig(VARS);
    expect(c.mailDomains).toEqual(["agents.acme.dev"]);
    expect(c.trustedAuthservIds).toEqual(["mx.cloudflare.net"]);
    expect(c.limits).toEqual({ freePlanReplyOnly: false, dailySendCap: false, planInboxCap: false });
    expect(c.allowSignup).toBe(false);
    expect(c.mailFrom).toBe("noreply@agents.acme.dev");
    expect(c.ownerEmail).toBe("owner@acme.dev");
    expect(c.publicUrl).toBeUndefined();
    expect(c.ses).toEqual({ region: "us-east-1", accessKeyId: "AKIAEXAMPLE", secretAccessKey: "s".repeat(40) });
    expect(c.sesEvents).toBeUndefined();
  });

  it("reads the optional settings", () => {
    const c = loadConfig({
      ...VARS,
      MAIL_FROM: "robot@acme.dev",
      OWNER_EMAIL: "Owner@Acme.dev",
      PUBLIC_URL: "https://mail.acme.dev/",
      TRUSTED_AUTHSERV_IDS: "mx.acme.dev",
      SES_CONFIGURATION_SET: "send0",
      SES_EVENTS_TOKEN: "t".repeat(32),
      SES_EVENTS_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:send0",
    });
    expect(c.mailFrom).toBe("robot@acme.dev");
    expect(c.ownerEmail).toBe("owner@acme.dev");
    expect(c.publicUrl).toBe("https://mail.acme.dev");
    expect(c.trustedAuthservIds).toEqual(["mx.acme.dev"]);
    expect(c.ses).toEqual({ region: "us-east-1", accessKeyId: "AKIAEXAMPLE", secretAccessKey: "s".repeat(40), configurationSet: "send0" });
    expect(c.sesEvents).toEqual({ token: "t".repeat(32), topicArn: "arn:aws:sns:us-east-1:123456789012:send0" });
  });

  it("lets sign-up open without an owner", () => {
    expect(loadConfig({ ...VARS, OWNER_EMAIL: "", ALLOW_SIGNUP: "true" }).allowSignup).toBe(true);
  });

  it("lists every problem at once, by name", () => {
    const problems = problemsOf({
      MAIL_DOMAINS: "agents.example.com",
      SECRET_KEY: "short",
      SES_ACCESS_KEY_ID: "AKIAEXAMPLE",
      PUBLIC_URL: "https://mail.acme.dev/path",
      SES_EVENTS_TOKEN: "t".repeat(40),
      MAIL_FROM: "nope",
    });
    expect(problems.map((p) => p.split(":")[0])).toEqual([
      "MAIL_DOMAINS",
      "SECRET_KEY",
      "OWNER_EMAIL",
      "MAIL_FROM",
      "PUBLIC_URL",
      "SES_SECRET_ACCESS_KEY",
      "SES_REGION",
      "SES_EVENTS_TOKEN",
    ]);
  });

  it("requires the basics", () => {
    expect(problemsOf({}).map((p) => p.split(":")[0])).toEqual([
      "MAIL_DOMAINS",
      "SECRET_KEY",
      "OWNER_EMAIL",
      "SES_ACCESS_KEY_ID",
      "SES_SECRET_ACCESS_KEY",
      "SES_REGION",
    ]);
  });

  it("requires SES, since the owner must verify their email", () => {
    for (const name of ["SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_REGION"]) {
      expect(problemsOf({ ...VARS, [name]: " " })).toEqual([expect.stringMatching(new RegExp(`^${name}: is required`))]);
    }
  });

  it("checks the SES region and the events token's length", () => {
    const problems = problemsOf({
      ...VARS,
      SES_ACCESS_KEY_ID: "AKIAEXAMPLE",
      SES_SECRET_ACCESS_KEY: "secret",
      SES_REGION: "mars",
      SES_EVENTS_TOKEN: "short",
      SES_EVENTS_TOPIC_ARN: "arn:aws:sns:us-east-1:1:x",
    });
    expect(problems).toEqual([
      "SES_REGION: must be an AWS region, like us-east-1",
      "SES_EVENTS_TOKEN: must be at least 32 characters (generate one with `openssl rand -hex 32`)",
    ]);
  });
});

describe("configErrorResponse", () => {
  it("is a plain-text 500 naming the problems and never the values", async () => {
    const secret = "super-secret-but-short";
    const problems = problemsOf({ ...VARS, SECRET_KEY: secret, OWNER_EMAIL: "not-an-email" });
    const res = configErrorResponse(problems);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toContain("SECRET_KEY: must be at least 32 characters");
    expect(text).toContain("OWNER_EMAIL: must be an email address");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("not-an-email");
  });
});

describe("configCache", () => {
  it("validates each env once and logs a failure once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const configFor = configCache();
    const bad = { ...VARS, SECRET_KEY: "" };
    expect(configFor(bad)).toEqual({ ok: false, problems: [expect.stringMatching(/^SECRET_KEY: is required/)] });
    expect(configFor(bad)).toBe(configFor(bad));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).not.toContain(VARS.OWNER_EMAIL);
    const good = configFor(VARS);
    expect(good.ok).toBe(true);
    expect(configFor(VARS)).toBe(good);
    error.mockRestore();
  });
});
