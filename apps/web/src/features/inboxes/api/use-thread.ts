import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { inboxKeys } from "./keys";

/** A thread with its messages, oldest first. */
export function useThread(inboxId: string, threadId: string | null) {
  return useQuery({
    queryKey: inboxKeys.thread(inboxId, threadId ?? ""),
    queryFn: () => send0.threads.get(inboxId, threadId!),
    enabled: !!threadId,
  });
}
