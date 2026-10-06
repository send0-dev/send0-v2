import type { MessageFilter } from "@send0/core";
import { hubName, type EventEnvelope } from "@send0/pipeline";

/** How the API talks to hubs. Production uses the Durable Object namespace; tests use HubState. */
export interface HubClient {
  wait(inboxId: string, filter: MessageFilter, sinceMs: number, timeoutMs: number): Promise<EventEnvelope | null>;
  /** An SSE response from the hub for `inbox:…` or `org:…` */
  stream(name: string, signal: AbortSignal): Promise<Response>;
}

export function durableHubClient(ns: DurableObjectNamespace<import("./hub-do").Hub>): HubClient {
  return {
    wait: (inboxId, filter, sinceMs, timeoutMs) => ns.get(ns.idFromName(hubName.inbox(inboxId))).wait(filter, sinceMs, timeoutMs),
    stream: (name, signal) => ns.get(ns.idFromName(name)).fetch("https://hub/stream", { signal }),
  };
}
