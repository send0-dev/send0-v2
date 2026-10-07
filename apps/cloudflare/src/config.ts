import { ConfigError, parseCoreConfig, type CoreConfig } from "@send0/config";

export { ConfigError };

/** SES credentials for outbound mail (customer mail and system email). */
export interface SesSettings {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Unset: the account's default configuration set, if any */
  configurationSet?: string;
}

/** Everything the one-Worker edition reads from its vars and secrets. */
export interface CloudflareConfig extends CoreConfig {
  /** Signs download links. Secret. */
  secretKey: string;
  /** Only this email may create the first account (required while sign-up is closed). Lowercased. */
  ownerEmail?: string;
  /** Sender of system email (verification, password resets, invites) */
  mailFrom: string;
  /** Fixed public origin, without a trailing slash; unset means each request's own origin */
  publicUrl?: string;
  /** Required: without it the owner could never verify their email, and nothing could be sent */
  ses: SesSettings;
  /** SNS → `/internal/ses-events`, when both are set */
  sesEvents?: { token: string; topicArn: string };
}

/** Email Routing's MX stamps Authentication-Results with this authserv-id. */
export const CLOUDFLARE_AUTHSERV_ID = "mx.cloudflare.net";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
/** The placeholder in wrangler.jsonc, and anything else under the RFC 2606 example domains. */
const EXAMPLE_DOMAIN = /(^|\.)example\.(com|net|org)$/;

/** A trimmed string, or undefined when unset or blank. */
const str = (env: Record<string, unknown>, name: string): string | undefined => {
  const v = env[name];
  return typeof v === "string" ? v.trim() || undefined : undefined;
};

/** True for a bare http(s) origin with at most a trailing slash. */
function isOrigin(v: string): boolean {
  try {
    const u = new URL(v);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      !/[?#]/.test(v)
    );
  } catch {
    return false;
  }
}

/**
 * Reads and validates the Worker's settings. Throws one ConfigError listing every problem at once.
 * Problems name the variable and the rule, never its value, so secrets can't leak.
 */
export function loadConfig(input: object): CloudflareConfig {
  const env = input as Record<string, unknown>;
  const problems: string[] = [];

  let core: CoreConfig | undefined;
  try {
    core = parseCoreConfig(
      { ...env, TRUSTED_AUTHSERV_IDS: str(env, "TRUSTED_AUTHSERV_IDS") ?? CLOUDFLARE_AUTHSERV_ID },
      { limits: "none", allowSignup: false },
    );
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    problems.push(...err.problems);
  }
  // Email Routing's results are always trusted, as Docker always trusts its own MX; extra ids add to it.
  if (core && !core.trustedAuthservIds.includes(CLOUDFLARE_AUTHSERV_ID)) {
    core = { ...core, trustedAuthservIds: [...core.trustedAuthservIds, CLOUDFLARE_AUTHSERV_ID] };
  }
  if (core?.mailDomains.some((d) => EXAMPLE_DOMAIN.test(d))) {
    problems.push("MAIL_DOMAINS: replace the example domain with the domain(s) you receive mail on, like agents.acme.com");
  }

  const secretKey = str(env, "SECRET_KEY");
  if (!secretKey) problems.push("SECRET_KEY: is required (generate one with `openssl rand -hex 32`)");
  else if (secretKey.length < 32) problems.push("SECRET_KEY: must be at least 32 characters (generate one with `openssl rand -hex 32`)");

  const ownerEmail = str(env, "OWNER_EMAIL")?.toLowerCase();
  if (!ownerEmail && !(core?.allowSignup ?? false)) {
    problems.push("OWNER_EMAIL: is required while ALLOW_SIGNUP is false (the email of the first account, who becomes the owner)");
  } else if (ownerEmail && !EMAIL.test(ownerEmail)) problems.push("OWNER_EMAIL: must be an email address, like you@acme.com");

  const explicitFrom = str(env, "MAIL_FROM");
  if (explicitFrom && !EMAIL.test(explicitFrom)) problems.push("MAIL_FROM: must be an email address, like noreply@acme.com");
  const mailFrom = explicitFrom ?? (core ? `noreply@${core.mailDomains[0]}` : undefined);

  const rawPublicUrl = str(env, "PUBLIC_URL");
  if (rawPublicUrl && !isOrigin(rawPublicUrl)) {
    problems.push("PUBLIC_URL: must be an http(s) origin only, like https://mail.acme.com (no path, query or hash)");
  }
  const publicUrl = rawPublicUrl?.replace(/\/+$/, "");

  const ses = sesSettings(env, problems);

  const token = str(env, "SES_EVENTS_TOKEN");
  const topicArn = str(env, "SES_EVENTS_TOPIC_ARN");
  if (!!token !== !!topicArn) problems.push("SES_EVENTS_TOKEN: set together with SES_EVENTS_TOPIC_ARN (both or neither)");
  else if (token && token.length < 32) {
    // The token is the endpoint's only credential.
    problems.push("SES_EVENTS_TOKEN: must be at least 32 characters (generate one with `openssl rand -hex 32`)");
  }

  if (problems.length || !core || !secretKey || !mailFrom || !ses) throw new ConfigError(problems);
  return {
    ...core,
    secretKey,
    mailFrom,
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(publicUrl ? { publicUrl } : {}),
    ses,
    ...(token && topicArn ? { sesEvents: { token, topicArn } } : {}),
  };
}

/**
 * SES is required: sign-up is verify-first, so without a mailer the owner could never verify their
 * email (and verifying automatically would let anyone who finds the Worker claim the install).
 */
function sesSettings(env: Record<string, unknown>, problems: string[]): SesSettings | undefined {
  const accessKeyId = str(env, "SES_ACCESS_KEY_ID");
  const secretAccessKey = str(env, "SES_SECRET_ACCESS_KEY");
  const region = str(env, "SES_REGION");
  const configurationSet = str(env, "SES_CONFIGURATION_SET");
  const why = "send0 sends verification email and your mail through SES";
  if (!accessKeyId) problems.push(`SES_ACCESS_KEY_ID: is required (${why}; an IAM user allowed ses:SendRawEmail)`);
  if (!secretAccessKey) problems.push(`SES_SECRET_ACCESS_KEY: is required (${why}; the secret of the SES_ACCESS_KEY_ID user)`);
  if (!region) problems.push("SES_REGION: is required (the region your SES identity is in, like us-east-1)");
  else if (!AWS_REGION.test(region)) problems.push("SES_REGION: must be an AWS region, like us-east-1");
  if (!accessKeyId || !secretAccessKey || !region || !AWS_REGION.test(region)) return undefined;
  return { region, accessKeyId, secretAccessKey, ...(configurationSet ? { configurationSet } : {}) };
}

/** The result of validating once: the config, or the problems to show on every request. */
export type ConfigResult = { ok: true; config: CloudflareConfig } | { ok: false; problems: string[] };

/**
 * Validates an env once and remembers the answer for that env object (one per isolate on Workers).
 * The first failure is logged as JSON, by variable name only.
 */
export function configCache(): (env: object) => ConfigResult {
  const seen = new WeakMap<object, ConfigResult>();
  return (env) => {
    let result = seen.get(env);
    if (!result) {
      try {
        result = { ok: true, config: loadConfig(env) };
      } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        result = { ok: false, problems: err.problems };
        console.error(JSON.stringify({ event: "config.invalid", problems: err.problems }));
      }
      seen.set(env, result);
    }
    return result;
  };
}

/** The 500 page a misconfigured install shows on every request: the problems, never any values. */
export function configErrorResponse(problems: string[]): Response {
  const body = [
    "send0 can't start: its configuration has problems.",
    "",
    ...problems.map((p) => `  - ${p}`),
    "",
    "Set these in the Cloudflare dashboard (Workers & Pages > send0 > Settings > Variables and Secrets),",
    "or in wrangler.jsonc and with `wrangler secret put`, then deploy again.",
    "",
  ].join("\n");
  return new Response(body, { status: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
