import { NO_LIMITS } from "@send0/config";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config";

const SECRET = "s".repeat(40);
const base = {
  DOMAIN: "mail.acme.dev",
  SECRET_KEY: SECRET,
  DATABASE_URL: "postgres://send0:hunter2-db-pass@db:5432/send0",
  SMTP_URL: "smtp://relay-user:hunter2-smtp-pass@smtp.relay.dev:587",
  OWNER_EMAIL: "Owner@Acme.dev",
};
const SES = {
  MAILER: "ses",
  SES_REGION: "ap-south-1",
  SES_ACCESS_KEY_ID: "AKIA",
  SES_SECRET_ACCESS_KEY: "sekrit",
  SES_CONFIGURATION_SET: "default",
};
const TOKEN = "t".repeat(32);

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
      ownerEmail: "owner@acme.dev",
      host: "0.0.0.0",
      trustedProxies: ["127.0.0.0/8", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"],
      mailer: { kind: "smtp", url: base.SMTP_URL },
      mailFrom: "noreply@mail.acme.dev",
      blob: { driver: "fs", dir: "/data/blobs" },
      port: 3000,
      smtp: { hostname: "mail.acme.dev", port: 2525, maxClients: 30 },
    });
    expect(c.sesEvents).toBeUndefined();
    expect(c.migrationsDir).toBeUndefined();
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
      SMTP_MAX_CLIENTS: "12",
      MIGRATIONS_DIR: "/app/migrations",
    });
    expect(c).toMatchObject({
      publicUrl: "http://127.0.0.1:8080",
      mailFrom: "robot@acme.dev",
      port: 8080,
      // Our own MX always writes Authentication-Results, so it stays trusted alongside the operator's ids.
      trustedAuthservIds: ["mx.cloudflare.net", "mx.acme.dev"],
      allowSignup: true,
      blob: { driver: "fs", dir: "/tmp/blobs" },
      webDir: "/app/web",
      migrationsDir: "/app/migrations",
      smtp: { hostname: "mx.acme.dev", port: 25, maxClients: 12, tlsCert: "/certs/cert.pem", tlsKey: "/certs/key.pem" },
    });
    expect(c.limits.dailySendCap).toBe(true);
  });

  it("does not list the MX hostname twice when it is already trusted", () => {
    const c = loadConfig({ ...base, MX_HOSTNAME: "mx.acme.dev", TRUSTED_AUTHSERV_IDS: "MX.acme.dev,mx.cloudflare.net" });
    expect(c.trustedAuthservIds.filter((id) => id.toLowerCase() === "mx.acme.dev")).toHaveLength(1);
    expect(c.trustedAuthservIds).toContain("mx.cloudflare.net");
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
    const c = loadConfig({ ...base, ...SES, SES_EVENTS_TOKEN: TOKEN, SES_EVENTS_TOPIC_ARN: "arn:aws:sns:x" });
    expect(c.sesEvents).toEqual({ token: TOKEN, topicArn: "arn:aws:sns:x" });
    expect(problems({ ...base, ...SES, SES_EVENTS_TOKEN: TOKEN })).toEqual([
      "SES_EVENTS_TOKEN: set together with SES_EVENTS_TOPIC_ARN (both or neither)",
    ]);
  });

  it("wants a long SES events token, and only with MAILER=ses", () => {
    expect(problems({ ...base, ...SES, SES_EVENTS_TOKEN: "short", SES_EVENTS_TOPIC_ARN: "arn:aws:sns:x" })).toEqual([
      "SES_EVENTS_TOKEN: must be at least 32 characters (generate one with `openssl rand -hex 32`)",
    ]);
    expect(problems({ ...base, SES_EVENTS_TOKEN: TOKEN, SES_EVENTS_TOPIC_ARN: "arn:aws:sns:x" })).toEqual([
      "SES_EVENTS_TOKEN: only applies when MAILER=ses",
    ]);
  });

  it("requires OWNER_EMAIL while sign-up is closed", () => {
    expect(problems({ ...base, OWNER_EMAIL: undefined })).toEqual([
      "OWNER_EMAIL: is required while ALLOW_SIGNUP is false (the email of the first account, who becomes the owner)",
    ]);
    expect(problems({ ...base, OWNER_EMAIL: "owner" })).toEqual(["OWNER_EMAIL: must be an email address, like you@acme.com"]);
    const open = loadConfig({ ...base, OWNER_EMAIL: undefined, ALLOW_SIGNUP: "true" });
    expect(open.allowSignup).toBe(true);
    expect(open.ownerEmail).toBeUndefined();
  });

  it("takes the bind address and trusted proxies", () => {
    expect(loadConfig({ ...base, HOST: "127.0.0.1", TRUSTED_PROXIES: "203.0.113.0/24, ::1" })).toMatchObject({
      host: "127.0.0.1",
      trustedProxies: ["203.0.113.0/24", "::1"],
    });
    expect(loadConfig({ ...base, TRUSTED_PROXIES: "none" }).trustedProxies).toEqual([]);
    expect(problems({ ...base, TRUSTED_PROXIES: "10.0.0.0/8, proxy.local, 1.2.3.4/40", HOST: "not a host" })).toEqual([
      "HOST: must be an IP address or hostname to listen on, like 0.0.0.0",
      "TRUSTED_PROXIES: must be IP addresses or CIDR ranges, like 10.0.0.0/8 (or none)",
    ]);
  });

  it("wants PUBLIC_URL as a bare origin and SMTP_URL as smtp:// or smtps://", () => {
    expect(loadConfig({ ...base, PUBLIC_URL: "https://mail.acme.dev/" }).publicUrl).toBe("https://mail.acme.dev");
    for (const PUBLIC_URL of ["https://acme.dev/send0", "https://acme.dev/?x=1", "https://acme.dev/#top"]) {
      expect(problems({ ...base, PUBLIC_URL })).toEqual([
        "PUBLIC_URL: must be an origin only, like https://mail.acme.com (no path, query or hash)",
      ]);
    }
    expect(loadConfig({ ...base, SMTP_URL: "smtps://u:p@relay.dev:465" }).mailer).toMatchObject({ kind: "smtp" });
    expect(problems({ ...base, SMTP_URL: "https://relay.dev" })).toEqual([
      "SMTP_URL: must be an smtp:// or smtps:// URL, like smtp://user:pass@host:587",
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
      "OWNER_EMAIL: is required while ALLOW_SIGNUP is false (the email of the first account, who becomes the owner)",
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
        SMTP_MAX_CLIENTS: "0",
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
      "SMTP_MAX_CLIENTS: must be a whole number from 1 to 10000",
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
