import { hubName, type HubClient } from "@send0/pipeline";

export function durableHubClient(ns: DurableObjectNamespace<import("./hub-do").Hub>): HubClient {
  return {
    wait: (inboxId, filter, sinceMs, timeoutMs) => ns.get(ns.idFromName(hubName.inbox(inboxId))).wait(filter, sinceMs, timeoutMs),
    stream: (name, signal) => ns.get(ns.idFromName(name)).fetch("https://hub/stream", { signal }),
  };
}
