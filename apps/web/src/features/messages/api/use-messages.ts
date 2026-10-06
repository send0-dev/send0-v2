import type { ListAllMessagesParams } from "@send0/sdk";
import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { messageKeys } from "./keys";

/** Messages across every inbox, newest first, with the given filters. */
export function useMessages(filters: Omit<ListAllMessagesParams, "cursor"> = {}) {
  return useCursorList(messageKeys.list(filters), (cursor) => send0.messages.listAll({ limit: 50, ...filters, cursor }));
}
