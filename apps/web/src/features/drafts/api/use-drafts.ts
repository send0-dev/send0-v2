import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { draftKeys, type DraftStatus } from "./keys";

export function useDrafts(status: DraftStatus) {
  return useCursorList(draftKeys.list(status), (cursor) => send0.drafts.listAll({ status, limit: 50, cursor }));
}
