import type { ApiKey } from "@send0/sdk";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import type { CursorPage } from "@/lib/use-cursor-list";
import { apiKeyKeys } from "./keys";

type Cache = InfiniteData<CursorPage<ApiKey>>;

/** Revokes a key, removing it from the list right away; the refetch afterwards restores it if the request failed. */
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send0.apiKeys.revoke(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: apiKeyKeys.list() });
      qc.setQueryData<Cache>(
        apiKeyKeys.list(),
        (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.filter((k) => k.id !== id) })) },
      );
    },
    // Success or failure, the list is refetched: a failed revoke reappears.
    onSettled: () => qc.invalidateQueries({ queryKey: apiKeyKeys.list() }),
  });
}
