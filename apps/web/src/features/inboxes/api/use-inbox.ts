import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { inboxKeys } from "./keys";

export function useInbox(inboxId: string | undefined) {
  return useQuery({ queryKey: inboxKeys.detail(inboxId ?? ""), queryFn: () => send0.inboxes.get(inboxId!), enabled: !!inboxId });
}
