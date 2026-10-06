import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { inboxKeys } from "./keys";

export function useThreads(inboxId: string) {
  return useCursorList(inboxKeys.threads(inboxId), (cursor) => send0.threads.list(inboxId, { limit: 50, cursor }));
}
