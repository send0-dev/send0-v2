import { parseSmtpUrl } from "@send0/adapters/node/smtp-mailer";
import { ConfigError, parseCoreConfig, type CoreConfig } from "@send0/config";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_TRUSTED_PROXIES, parseCidr } from "./client-ip";

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
  /** Only this email may create the first account (required while sign-up is closed). Lowercased. */
  ownerEmail?: string;
  /** HTTP bind address, e.g. 0.0.0.0 */
  host: string;
  /** HTTP listen port (0 picks a free one) */
  port: number;
  /** Proxies whose X-Forwarded-For is believed (IPs or CIDRs); empty trusts none */
  trustedProxies: string[];
  /** The built dashboard SPA (index.html plus assets) */
  webDir: string;
  /** The inbound SMTP role. Each client may buffer a whole message (~25 MiB), so `maxClients` bounds memory. */
  smtp: { hostname: string; port: number; maxClients: number; tlsCert?: string; tlsKey?: string };
  /** The SQL migrations folder; unset means the one shipped next to `@send0/db` (the image sets its own) */
  migrationsDir?: string;
}

/** In a source checkout the SPA builds to apps/web/dist/client; the image sets WEB_DIR instead. */
const DEFAULT_WEB_DIR = fileURLToPath(new URL("../../web/dist/client", import.meta.url).href);

/** Concurrent inbound SMTP sessions. Each may buffer a message of up to ~25 MiB, so this bounds worst-case memory. */
const DEFAULT_SMTP_MAX_CLIENTS = 30;

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
  HOST: opt(),
  TRUSTED_PROXIES: opt(),
  OWNER_EMAIL: opt(),
  WEB_DIR: opt(),
  MX_HOSTNAME: opt(),
  SMTP_PORT: opt(),
  SMTP_MAX_CLIENTS: opt(),
  MIGRATIONS_DIR: opt(),
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

/** True for a bare origin: http(s)://host[:port] with at most a trailing slash. */
function isOrigin(v: string): boolean {
  const u = new URL(v);
  return u.pathname === "/" && !u.search && !u.hash && !v.includes("?") && !v.includes("#") && !u.username && !u.password;
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
  else if (env.PUBLIC_URL && !isOrigin(env.PUBLIC_URL)) {
    problems.push("PUBLIC_URL: must be an origin only, like https://mail.acme.com (no path, query or hash)");
  }
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

  const allowSignup = core?.allowSignup ?? false;
  const ownerEmail = env.OWNER_EMAIL?.toLowerCase();
  if (!ownerEmail && !allowSignup) {
    problems.push("OWNER_EMAIL: is required while ALLOW_SIGNUP is false (the email of the first account, who becomes the owner)");
  } else if (ownerEmail && !EMAIL.test(ownerEmail)) problems.push("OWNER_EMAIL: must be an email address, like you@acme.com");

  let mailer: MailerConfig | undefined;
  const mailerKind = (env.MAILER ?? "smtp").toLowerCase();
  if (mailerKind === "smtp") {
    problems.push(...missing(env, ["SMTP_URL"], "when MAILER=smtp (smtp://user:pass@host:587)"));
    if (env.SMTP_URL && !/^smtps?:\/\/[^/]/i.test(env.SMTP_URL)) {
      problems.push("SMTP_URL: must be an smtp:// or smtps:// URL, like smtp://user:pass@host:587");
    } else if (env.SMTP_URL) {
      // The mailer's own parser, so a URL that passes here can't fail at start. Its messages never include the password.
      try {
        parseSmtpUrl(env.SMTP_URL);
        mailer = { kind: "smtp", url: env.SMTP_URL };
      } catch (err) {
        problems.push(`SMTP_URL: ${(err instanceof Error ? err.message : String(err)).replace(/^SMTP_URL:?\s*/, "")}`);
      }
    }
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
  if ((env.SES_EVENTS_TOKEN || env.SES_EVENTS_TOPIC_ARN) && mailerKind === "smtp") {
    problems.push("SES_EVENTS_TOKEN: only applies when MAILER=ses");
  } else if (env.SES_EVENTS_TOKEN && env.SES_EVENTS_TOKEN.length < 32) {
    // The token is the endpoint's only credential.
    problems.push("SES_EVENTS_TOKEN: must be at least 32 characters (generate one with `openssl rand -hex 32`)");
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

  const host = env.HOST ?? "0.0.0.0";
  if (!isIP(host) && !HOSTNAME.test(host.toLowerCase()))
    problems.push("HOST: must be an IP address or hostname to listen on, like 0.0.0.0");
  const trustedProxies =
    env.TRUSTED_PROXIES === undefined
      ? [...DEFAULT_TRUSTED_PROXIES]
      : env.TRUSTED_PROXIES.toLowerCase() === "none"
        ? []
        : env.TRUSTED_PROXIES.split(",")
            .map((s) => s.trim())
            .filter(Boolean);
  if (trustedProxies.some((p) => !parseCidr(p))) {
    problems.push("TRUSTED_PROXIES: must be IP addresses or CIDR ranges, like 10.0.0.0/8 (or none)");
  }

  const httpPort = parsePort(env, "PORT", 3000, problems);
  const smtpPort = parsePort(env, "SMTP_PORT", 2525, problems);
  const smtpMaxClients = Number(env.SMTP_MAX_CLIENTS ?? DEFAULT_SMTP_MAX_CLIENTS);
  if (env.SMTP_MAX_CLIENTS !== undefined && (!/^\d+$/.test(env.SMTP_MAX_CLIENTS) || smtpMaxClients < 1 || smtpMaxClients > 10_000)) {
    problems.push("SMTP_MAX_CLIENTS: must be a whole number from 1 to 10000");
  }

  if (problems.length || !domain || !publicUrl || !core || !mailer || !blob || !mailFrom || !mxHostname) throw new ConfigError(problems);
  return {
    ...core,
    // Our own MX writes Authentication-Results (and strips forged copies), so it is always trusted.
    trustedAuthservIds: core.trustedAuthservIds.some((id) => id.toLowerCase() === mxHostname)
      ? core.trustedAuthservIds
      : [...core.trustedAuthservIds, mxHostname],
    domain,
    publicUrl,
    secretKey: env.SECRET_KEY!,
    databaseUrl: env.DATABASE_URL!,
    mailer,
    ...(sesEvents ? { sesEvents } : {}),
    mailFrom,
    blob,
    ...(ownerEmail ? { ownerEmail } : {}),
    host,
    port: httpPort,
    trustedProxies,
    webDir: env.WEB_DIR ?? DEFAULT_WEB_DIR,
    ...(env.MIGRATIONS_DIR ? { migrationsDir: env.MIGRATIONS_DIR } : {}),
    smtp: {
      hostname: mxHostname,
      port: smtpPort,
      maxClients: smtpMaxClients,
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
