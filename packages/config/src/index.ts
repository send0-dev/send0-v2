import { z } from "zod";

/** Which hosted-service limits apply. A self-hosted install turns them all off. */
export interface Limits {
  /** Orgs on the free plan may only reply to people who emailed the inbox first. */
  freePlanReplyOnly: boolean;
  /** Each org's dailySendLimit is enforced. */
  dailySendCap: boolean;
  /** Each plan's inbox count is enforced. */
  planInboxCap: boolean;
}

export const HOSTED_LIMITS: Limits = { freePlanReplyOnly: true, dailySendCap: true, planInboxCap: true };
export const NO_LIMITS: Limits = { freePlanReplyOnly: false, dailySendCap: false, planInboxCap: false };

/** Settings every runtime shares: hosted Workers, Docker and the Cloudflare template. */
export interface CoreConfig {
  /** Domains this install receives mail for. The first is the default for new inboxes. */
  mailDomains: string[];
  /** authserv-ids whose Authentication-Results headers we trust (our MX). */
  trustedAuthservIds: string[];
  limits: Limits;
  /** false: sign-up only until the first account exists, then invites only. */
  allowSignup: boolean;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const list = z.string().transform((v) =>
  v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const schema = z.object({
  MAIL_DOMAINS: list.pipe(
    z.array(z.string().regex(DOMAIN, "must be domain names, like agents.acme.com")).min(1, "needs at least one domain"),
  ),
  TRUSTED_AUTHSERV_IDS: list.optional(),
  LIMITS: z.enum(["hosted", "none"]).optional(),
  ALLOW_SIGNUP: flag.optional(),
});

/**
 * Reads the shared settings from an env object (process.env or a Worker's env). Each runtime
 * passes its own defaults; values set in the env always win. Throws ConfigError listing every problem.
 */
export function parseCoreConfig(env: object, defaults: { limits?: "hosted" | "none"; allowSignup?: boolean } = {}): CoreConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`));
  const v = parsed.data;
  return {
    mailDomains: v.MAIL_DOMAINS,
    trustedAuthservIds: v.TRUSTED_AUTHSERV_IDS ?? [],
    limits: (v.LIMITS ?? defaults.limits ?? "hosted") === "none" ? NO_LIMITS : HOSTED_LIMITS,
    allowSignup: v.ALLOW_SIGNUP ?? defaults.allowSignup ?? true,
  };
}
