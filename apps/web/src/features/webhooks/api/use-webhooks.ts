import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { webhookKeys } from "./keys";

export function useWebhooks(opts: { enabled?: boolean } = {}) {
  return useCursorList(webhookKeys.list(), (cursor) => send0.webhooks.list({ limit: 100, cursor }), opts);
}

export function useWebhook(id: string | undefined) {
  return useQuery({ queryKey: webhookKeys.detail(id ?? ""), queryFn: () => send0.webhooks.get(id!), enabled: !!id });
}
