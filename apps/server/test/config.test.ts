import { NO_LIMITS } from "@send0/config";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config";

const SECRET = "s".repeat(40);
const base = {
  DOMAIN: "mail.acme.dev",
  SECRET_KEY: SECRET,
  DATABASE_URL: "postgres://send0:hunter2-db-pass@db:5432/send0",
  SMTP_URL: "smtp://relay-user:hunter2-smtp-pass@smtp.relay.dev:587",
};

/** The problems a bad env produces. */
function problems(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  throw new Error("expected a ConfigError");
}

describe("loadConfig", () => {
  it("fills in self-host defaults from DOMAIN", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      domain: "mail.acme.dev",
      publicUrl: "https://mail.acme.dev",
      mailDomains: ["mail.acme.dev"],
      trustedAuthservIds: ["mail.acme.dev"],
      limits: NO_LIMITS,
      allowSignup: false,
      mailer: { kind: "smtp", url: base.SMTP_URL },
      mailFrom: "noreply@mail.acme.dev",
      blob: { driver: "fs", dir: "/data/blobs" },
      port: 3000,
      smtp: { hostname: "mail.acme.dev", port: 2525 },
    });
    expect(c.sesEvents).toBeUndefined();
    expect(c.webDir).toMatch(/apps\/web\/dist\/client$/);
  });

  it("accepts MAIL_DOMAIN and MAIL_DOMAINS as the same setting", () => {
    expect(loadConfig({ ...base, MAIL_DOMAIN: "agents.acme.dev" }).mailDomains).toEqual(["agents.acme.dev"]);
    expect(loadConfig({ ...base, MAIL_DOMAINS: "a.acme.dev, B.acme.dev" }).mailDomains).toEqual(["a.acme.dev", "b.acme.dev"]);
    expect(loadConfig({ ...base, MAIL_DOMAINS: "a.acme.dev" }).mailFrom).toBe("noreply@a.acme.dev");
    expect(problems({ ...base, MAIL_DOMAIN: "a.acme.dev", MAIL_DOMAINS: "b.acme.dev" })).toEqual([
      "MAIL_DOMAIN: set MAIL_DOMAIN or MAIL_DOMAINS, not both",
    ]);
  });

  it("lets explicit values win over defaults", () => {
    const c = loadConfig({
      ...base,
      PUBLIC_URL: "http://127.0.0.1:8080/",
      MAIL_FROM: "robot@acme.dev",
      PORT: "8080",
      SMTP_PORT: "25",
      MX_HOSTNAME: "MX.acme.dev",
      TRUSTED_AUTHSERV_IDS: "mx.cloudflare.net",
      LIMITS: "hosted",
      ALLOW_SIGNUP: "true",
      BLOB_DIR: "/tmp/blobs",
      WEB_DIR: "/app/web",
      SMTP_TLS_CERT: "/certs/cert.pem",
      SMTP_TLS_KEY: "/certs/key.pem",
    });
    expect(c).toMatchObject({
      publicUrl: "http://127.0.0.1:8080",
      mailFrom: "robot@acme.dev",
      port: 8080,
      trustedAuthservIds: ["mx.cloudflare.net"],
      allowSignup: true,
      blob: { driver: "fs", dir: "/tmp/blobs" },
      webDir: "/app/web",
      smtp: { hostname: "mx.acme.dev", port: 25, tlsCert: "/certs/cert.pem", tlsKey: "/certs/key.pem" },
    });
    expect(c.limits.dailySendCap).toBe(true);
  });

  it("treats blank values as unset", () => {
    expect(loadConfig({ ...base, PORT: " ", MAILER: "", BLOB_DRIVER: "" })).toMatchObject({ port: 3000, mailer: { kind: "smtp" } });
  });

  it("configures SES when MAILER=ses, and requires its settings", () => {
    const ses = { SES_REGION: "ap-south-1", SES_ACCESS_KEY_ID: "AKIA", SES_SECRET_ACCESS_KEY: "sekrit", SES_CONFIGURATION_SET: "default" };
    expect(loadConfig({ ...base, SMTP_URL: undefined, MAILER: "ses", ...ses }).mailer).toEqual({
      kind: "ses",
      region: "ap-south-1",
      accessKeyId: "AKIA",
      secretAccessKey: "sekrit",
      configurationSet: "default",
    });
    expect(problems({ ...base, MAILER: "ses", SES_REGION: "ap-south-1" })).toEqual([
      "SES_ACCESS_KEY_ID: is required when MAILER=ses",
      "SES_SECRET_ACCESS_KEY: is required when MAILER=ses",
      "SES_CONFIGURATION_SET: is required when MAILER=ses",
    ]);
  });

  it("enables SES events only with both the token and the topic", () => {
    const c = loadConfig({ ...base, SES_EVENTS_TOKEN: "tok", SES_EVENTS_TOPIC_ARN: "arn:aws:sns:x" });
    expect(c.sesEvents).toEqual({ token: "tok", topicArn: "arn:aws:sns:x" });
    expect(problems({ ...base, SES_EVENTS_TOKEN: "tok" })).toEqual([
      "SES_EVENTS_TOKEN: set together with SES_EVENTS_TOPIC_ARN (both or neither)",
    ]);
  });

  it("configures S3 blobs, with an optional endpoint", () => {
    const s3 = { BLOB_DRIVER: "s3", S3_BUCKET: "mail", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "key" };
    expect(loadConfig({ ...base, ...s3 }).blob).toEqual({
      driver: "s3",
      bucket: "mail",
      region: "us-east-1",
      accessKeyId: "id",
      secretAccessKey: "key",
    });
    expect(loadConfig({ ...base, ...s3, S3_ENDPOINT: "http://minio:9000" }).blob).toMatchObject({ endpoint: "http://minio:9000" });
    expect(problems({ ...base, BLOB_DRIVER: "s3", S3_BUCKET: "mail" })).toEqual([
      "S3_REGION: is required when BLOB_DRIVER=s3",
      "S3_ACCESS_KEY_ID: is required when BLOB_DRIVER=s3",
      "S3_SECRET_ACCESS_KEY: is required when BLOB_DRIVER=s3",
    ]);
  });

  it("lists every problem at once", () => {
    expect(problems({ MAILER: "carrier-pigeon", BLOB_DRIVER: "floppy", PORT: "eighty", PUBLIC_URL: "ftp://x" })).toEqual([
      "DOMAIN: is required (the hostname people use to reach send0, like mail.acme.com)",
      "PUBLIC_URL: must be an http:// or https:// URL",
      "SECRET_KEY: is required (generate one with `openssl rand -hex 32`)",
      "DATABASE_URL: is required (postgres://user:password@host:5432/send0)",
      "MAILER: must be smtp or ses",
      "BLOB_DRIVER: must be fs or s3",
      "PORT: must be a port number (0-65535)",
    ]);
  });

  it("checks formats", () => {
    expect(
      problems({
        ...base,
        DOMAIN: "https://mail.acme.dev",
        SECRET_KEY: "short",
        DATABASE_URL: "mysql://x",
        MAIL_DOMAINS: "not a domain",
        MAIL_FROM: "nobody",
        SMTP_PORT: "70000",
        SMTP_TLS_KEY: "/k.pem",
      }),
    ).toEqual([
      "DOMAIN: must be a hostname, like mail.acme.com (no scheme or path)",
      "MAIL_DOMAINS: must be domain names, like agents.acme.com",
      "SECRET_KEY: must be at least 32 characters (generate one with `openssl rand -hex 32`)",
      "DATABASE_URL: must be a postgres:// or postgresql:// URL",
      "MAIL_FROM: must be an email address, like noreply@acme.com",
      "SMTP_TLS_CERT: set together with SMTP_TLS_KEY (both or neither)",
      "SMTP_PORT: must be a port number (0-65535)",
    ]);
  });

  it("explains that the mail domain defaults to DOMAIN", () => {
    expect(problems({ ...base, DOMAIN: "localhost" })).toEqual([
      "MAIL_DOMAINS: must be domain names, like agents.acme.com (defaults to DOMAIN)",
    ]);
  });

  it("never prints secret values", () => {
    const err = (() => {
      try {
        loadConfig({ ...base, SECRET_KEY: "tiny-secret", DATABASE_URL: "mysql://u:hunter2-db-pass@h/db", SMTP_URL: "" });
      } catch (e) {
        return e as ConfigError;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    for (const secret of ["tiny-secret", "hunter2-db-pass"]) expect(err!.message).not.toContain(secret);
  });
});
