import { ConfigError, parseCoreConfig, type CoreConfig } from "@send0/config";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export { ConfigError };

export type MailerConfig =
  { kind: "smtp"; url: string } | { kind: "ses"; region: string; accessKeyId: string; secretAccessKey: string; configurationSet: string };

export type BlobConfig =
  | { driver: "fs"; dir: string }
  | { driver: "s3"; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; endpoint?: string };

/** Everything the self-hosted server needs, read once from the environment at boot. */
export interface ServerConfig extends CoreConfig {
  /** Web hostname, e.g. mail.acme.com */
  domain: string;
  /** Where people and SDKs reach this install, without a trailing slash, e.g. https://mail.acme.com */
  publicUrl: string;
  /** Signs app-issued download links. Secret. */
  secretKey: string;
  /** Secret: may carry a password. */
  databaseUrl: string;
  mailer: MailerConfig;
  /** SNS → `/internal/ses-events`, when both are set */
  sesEvents?: { token: string; topicArn: string };
  /** Sender of system email (verification, password resets, invites) */
  mailFrom: string;
  blob: BlobConfig;
  /** HTTP listen port (0 picks a free one) */
  port: number;
  /** The built dashboard SPA (index.html plus assets) */
  webDir: string;
  /** The inbound SMTP role */
  smtp: { hostname: string; port: number; tlsCert?: string; tlsKey?: string };
}

/** In a source checkout the SPA builds to apps/web/dist/client; the image sets WEB_DIR instead. */
const DEFAULT_WEB_DIR = fileURLToPath(new URL("../../web/dist/client", import.meta.url).href);

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims strings; blank means unset. Values are never echoed in messages, since some are secrets. */
const opt = () => z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.string().optional());

const schema = z.object({
  DOMAIN: opt(),
  PUBLIC_URL: opt(),
  MAIL_DOMAIN: opt(),
  MAIL_DOMAINS: opt(),
  SECRET_KEY: opt(),
  DATABASE_URL: opt(),
  MAILER: opt(),
  SMTP_URL: opt(),
  SES_REGION: opt(),
  SES_ACCESS_KEY_ID: opt(),
  SES_SECRET_ACCESS_KEY: opt(),
  SES_CONFIGURATION_SET: opt(),
  SES_EVENTS_TOKEN: opt(),
  SES_EVENTS_TOPIC_ARN: opt(),
  MAIL_FROM: opt(),
  BLOB_DRIVER: opt(),
  BLOB_DIR: opt(),
  S3_BUCKET: opt(),
  S3_REGION: opt(),
  S3_ACCESS_KEY_ID: opt(),
  S3_SECRET_ACCESS_KEY: opt(),
  S3_ENDPOINT: opt(),
  PORT: opt(),
  WEB_DIR: opt(),
  MX_HOSTNAME: opt(),
  SMTP_PORT: opt(),
  SMTP_TLS_CERT: opt(),
  SMTP_TLS_KEY: opt(),
});

type Env = z.infer<typeof schema>;

/** Names the variables in `names` that are unset, as one problem per variable. */
function missing(env: Env, names: (keyof Env)[], why: string): string[] {
  return names.filter((n) => env[n] === undefined).map((n) => `${n}: is required ${why}`);
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * Reads and validates the server's settings. Throws one ConfigError listing every problem at once.
 * Problems name the variable and the rule, never its value, so secrets can't leak into logs.
 */
export function loadConfig(input: Record<string, string | undefined> = process.env): ServerConfig {
  // Every field is an optional string, so parsing only trims; the rules below collect every problem.
  const env = schema.parse(input);
  const problems: string[] = [];

  const domain = env.DOMAIN?.toLowerCase();
  if (!domain) problems.push("DOMAIN: is required (the hostname people use to reach send0, like mail.acme.com)");
  else if (!HOSTNAME.test(domain)) problems.push("DOMAIN: must be a hostname, like mail.acme.com (no scheme or path)");

  let publicUrl = env.PUBLIC_URL ?? (domain ? `https://${domain}` : undefined);
  if (env.PUBLIC_URL && !isHttpUrl(env.PUBLIC_URL)) problems.push("PUBLIC_URL: must be an http:// or https:// URL");
  publicUrl = publicUrl?.replace(/\/+$/, "");

  if (env.MAIL_DOMAIN && env.MAIL_DOMAINS && env.MAIL_DOMAIN !== env.MAIL_DOMAINS) {
    problems.push("MAIL_DOMAIN: set MAIL_DOMAIN or MAIL_DOMAINS, not both");
  }
  let core: CoreConfig | undefined;
  const mailDomains = env.MAIL_DOMAINS ?? env.MAIL_DOMAIN ?? domain;
  if (mailDomains !== undefined) {
    try {
      core = parseCoreConfig({ ...input, MAIL_DOMAINS: mailDomains }, { limits: "none", allowSignup: false });
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      // Name the variable the operator actually set (or say it came from DOMAIN).
      const name = env.MAIL_DOMAINS ? "MAIL_DOMAINS" : env.MAIL_DOMAIN ? "MAIL_DOMAIN" : null;
      for (const p of err.problems) {
        const m = /^MAIL_DOMAINS(?:\.\d+)?: (.*)$/.exec(p);
        problems.push(!m ? p : name ? `${name}: ${m[1]}` : `MAIL_DOMAINS: ${m[1]} (defaults to DOMAIN)`);
      }
    }
  }

  if (!env.SECRET_KEY) problems.push("SECRET_KEY: is required (generate one with `openssl rand -hex 32`)");
  else if (env.SECRET_KEY.length < 32)
    problems.push("SECRET_KEY: must be at least 32 characters (generate one with `openssl rand -hex 32`)");

  if (!env.DATABASE_URL) problems.push("DATABASE_URL: is required (postgres://user:password@host:5432/send0)");
  else if (!/^postgres(ql)?:\/\//i.test(env.DATABASE_URL)) problems.push("DATABASE_URL: must be a postgres:// or postgresql:// URL");

  let mailer: MailerConfig | undefined;
  const mailerKind = (env.MAILER ?? "smtp").toLowerCase();
  if (mailerKind === "smtp") {
    problems.push(...missing(env, ["SMTP_URL"], "when MAILER=smtp (smtp://user:pass@host:587)"));
    if (env.SMTP_URL) mailer = { kind: "smtp", url: env.SMTP_URL };
  } else if (mailerKind === "ses") {
    const sesVars = ["SES_REGION", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY", "SES_CONFIGURATION_SET"] as const;
    const gaps = missing(env, [...sesVars], "when MAILER=ses");
    problems.push(...gaps);
    if (!gaps.length) {
      mailer = {
        kind: "ses",
        region: env.SES_REGION!,
        accessKeyId: env.SES_ACCESS_KEY_ID!,
        secretAccessKey: env.SES_SECRET_ACCESS_KEY!,
        configurationSet: env.SES_CONFIGURATION_SET!,
      };
    }
  } else problems.push("MAILER: must be smtp or ses");

  if (!!env.SES_EVENTS_TOKEN !== !!env.SES_EVENTS_TOPIC_ARN) {
    problems.push("SES_EVENTS_TOKEN: set together with SES_EVENTS_TOPIC_ARN (both or neither)");
  }
  const sesEvents =
    env.SES_EVENTS_TOKEN && env.SES_EVENTS_TOPIC_ARN ? { token: env.SES_EVENTS_TOKEN, topicArn: env.SES_EVENTS_TOPIC_ARN } : undefined;

  const mailFrom = env.MAIL_FROM ?? (core ? `noreply@${core.mailDomains[0]}` : undefined);
  if (env.MAIL_FROM && !EMAIL.test(env.MAIL_FROM)) problems.push("MAIL_FROM: must be an email address, like noreply@acme.com");

  let blob: BlobConfig | undefined;
  const driver = (env.BLOB_DRIVER ?? "fs").toLowerCase();
  if (driver === "fs") blob = { driver: "fs", dir: env.BLOB_DIR ?? "/data/blobs" };
  else if (driver === "s3") {
    const gaps = missing(env, ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"], "when BLOB_DRIVER=s3");
    problems.push(...gaps);
    if (env.S3_ENDPOINT && !isHttpUrl(env.S3_ENDPOINT)) problems.push("S3_ENDPOINT: must be an http:// or https:// URL");
    if (!gaps.length) {
      blob = {
        driver: "s3",
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      };
    }
  } else problems.push("BLOB_DRIVER: must be fs or s3");

  const mxHostname = env.MX_HOSTNAME?.toLowerCase() ?? domain;
  if (env.MX_HOSTNAME && !HOSTNAME.test(mxHostname!)) problems.push("MX_HOSTNAME: must be a hostname, like mx.acme.com");
  if (!!env.SMTP_TLS_CERT !== !!env.SMTP_TLS_KEY) problems.push("SMTP_TLS_CERT: set together with SMTP_TLS_KEY (both or neither)");

  const httpPort = parsePort(env, "PORT", 3000, problems);
  const smtpPort = parsePort(env, "SMTP_PORT", 2525, problems);

  if (problems.length || !domain || !publicUrl || !core || !mailer || !blob || !mailFrom || !mxHostname) throw new ConfigError(problems);
  return {
    ...core,
    // Our own MX writes Authentication-Results; trust it unless the operator says otherwise.
    trustedAuthservIds: core.trustedAuthservIds.length ? core.trustedAuthservIds : [mxHostname],
    domain,
    publicUrl,
    secretKey: env.SECRET_KEY!,
    databaseUrl: env.DATABASE_URL!,
    mailer,
    ...(sesEvents ? { sesEvents } : {}),
    mailFrom,
    blob,
    port: httpPort,
    webDir: env.WEB_DIR ?? DEFAULT_WEB_DIR,
    smtp: {
      hostname: mxHostname,
      port: smtpPort,
      ...(env.SMTP_TLS_CERT && env.SMTP_TLS_KEY ? { tlsCert: env.SMTP_TLS_CERT, tlsKey: env.SMTP_TLS_KEY } : {}),
    },
  };
}

function parsePort(env: Env, name: "PORT" | "SMTP_PORT", fallback: number, problems: string[]): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n > 65535) problems.push(`${name}: must be a port number (0-65535)`);
  return n;
}
