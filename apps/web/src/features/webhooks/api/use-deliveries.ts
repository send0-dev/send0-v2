import type { Delivery } from "@send0/sdk";
import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { webhookKeys } from "./keys";

export type DeliveryFilter = Delivery["status"] | "all";

/** A webhook's delivery log, newest first. Refreshes every 10 seconds while open. */
export function useDeliveries(webhookId: string, status: DeliveryFilter) {
  return useCursorList(
    webhookKeys.deliveries(webhookId, status),
    (cursor) => send0.webhooks.deliveries(webhookId, { limit: 50, cursor, ...(status === "all" ? {} : { status }) }),
    { refetchInterval: 10_000 }
  );
}
