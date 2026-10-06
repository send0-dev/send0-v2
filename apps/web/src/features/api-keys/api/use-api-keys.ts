import { send0 } from "@/lib/api";
import { useCursorList } from "@/lib/use-cursor-list";
import { apiKeyKeys } from "./keys";

export function useApiKeys(opts: { enabled?: boolean } = {}) {
  return useCursorList(apiKeyKeys.list(), (cursor) => send0.apiKeys.list({ limit: 100, cursor }), opts);
}
