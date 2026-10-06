import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { draftKeys } from "./keys";

/** How many drafts wait for approval (up to 100), for the sidebar badge. Refreshes every minute. */
export function usePendingDraftCount(): number | undefined {
  const q = useQuery({
    queryKey: draftKeys.pendingCount(),
    queryFn: async () => (await send0.drafts.listAll({ status: "pending", limit: 100 })).data.length,
    refetchInterval: 60_000,
  });
  return q.data;
}
