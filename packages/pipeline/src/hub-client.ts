import type { MessageFilter } from "@send0/core";
import type { EventEnvelope } from "./events";

/**
 * How the API talks to hubs. Hosted uses the Durable Object namespace; self-host uses the Postgres hub;
 * tests use HubState directly. Lives here so every implementation shares one contract.
 */
export interface HubClient {
  wait(inboxId: string, filter: MessageFilter, sinceMs: number, timeoutMs: number): Promise<EventEnvelope | null>;
  /** An SSE response from the hub for `inbox:…` or `org:…` */
  stream(name: string, signal: AbortSignal): Promise<Response>;
}
