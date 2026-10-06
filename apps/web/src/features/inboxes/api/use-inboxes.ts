import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { inboxKeys } from "./keys";

export function useInboxes(opts: { enabled?: boolean } = {}) {
  return useCursorList(inboxKeys.list(), (cursor) => send0.inboxes.list({ limit: 100, cursor }), opts);
}
