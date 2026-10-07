import type { SignedUrlStore } from "@send0/adapters/blob";
import type { Mailer } from "@send0/adapters/mailer";
import type { Limits } from "@send0/config";
import type { Db } from "@send0/db";
import type { EventEnvelope, QueueLike } from "@send0/pipeline";
import type { HubClient } from "./realtime/client";

export type Scope = "read" | "send" | "admin";
export const SCOPES: readonly Scope[] = ["read", "send", "admin"];

export interface AuthContext {
  orgId: string;
  keyId: string;
  mode: "live" | "test";
  scopes: Scope[];
  /** null = every inbox in the org */
  inboxIds: string[] | null;
  /** "user" when a signed-in person acts through the dashboard; API keys are "key" (the default) */
  actor?: "key" | "user";
}

export interface AppDeps {
  db: Db;
  /** Domains this install receives mail for; the first is the default for new inboxes. */
  mailDomains: string[];
  /** Hosted-service limits (plan inbox caps, reply-only free plan, daily send cap). Defaults to HOSTED_LIMITS. */
  limits?: Limits;
  /** Hands out pre-signed download links for raw mail and attachments */
  files: SignedUrlStore;
  /** Real-time hubs (Durable Objects). Optional so routes can degrade gracefully. */
  hub?: HubClient;
  /** Event queue for webhook delivery */
  queue?: QueueLike;
  /** Outbound transport (SES). Without it, live sends fail with a clear error. */
  mailer?: Mailer;
  /** Push a committed event to real-time hubs and the webhook queue */
  publish?: (orgId: string, envelope: EventEnvelope) => Promise<void>;
  /**
   * Already-authenticated caller (the dashboard, over a private service binding).
   * When set, requests skip API-key auth and act with this context.
   */
  presetAuth?: AuthContext;
  /** SNS → SES events endpoint: shared secret in the URL, and the only topic we accept */
  sesEvents?: { token: string; topicArn: string };
  /** Defer work past the response (ctx.waitUntil on Workers). */
  waitUntil?: (p: Promise<unknown>) => void;
  now?: () => Date;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
    auth: AuthContext;
    requestId: string;
  };
};
