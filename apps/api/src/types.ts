import type { SignedUrlStore } from "@send0/adapters/blob";
import type { Db } from "@send0/db";
import type { QueueLike } from "@send0/pipeline";
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
}

export interface AppDeps {
  db: Db;
  /** Hands out pre-signed download links for raw mail and attachments */
  files: SignedUrlStore;
  /** Real-time hubs (Durable Objects). Optional so routes can degrade gracefully. */
  hub?: HubClient;
  /** Event queue for webhook delivery */
  queue?: QueueLike;
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
