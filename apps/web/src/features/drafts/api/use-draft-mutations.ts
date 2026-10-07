import type { Draft, UpdateDraftParams } from "@send0/sdk";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import type { CursorPage } from "@/lib/use-cursor-list";
import { inboxKeys } from "@/features/inboxes/api/keys";
import { messageKeys } from "@/features/messages/api/keys";
import { usageKeys } from "@/features/overview/api/keys";
import { draftKeys } from "./keys";

type Cache = InfiniteData<CursorPage<Draft>>;

export interface DecisionCallbacks {
  onSuccess?: (draft: Draft) => void;
  onError?: (error: unknown) => void;
}

/**
 * Removes a draft from the pending queue right away; the refetch afterwards puts it back if the request failed.
 * Callbacks go here rather than to mutate(): the card that started it unmounts as soon as the
 * draft leaves the list, and TanStack Query skips mutate() callbacks for unmounted components.
 */
function useDecision<R>(decide: (id: string) => Promise<R>, callbacks: DecisionCallbacks) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: Draft) => decide(draft.id),
    onSuccess: (_r, draft) => callbacks.onSuccess?.(draft),
    onMutate: async (draft) => {
      await qc.cancelQueries({ queryKey: draftKeys.list("pending") });
      qc.setQueryData<Cache>(
        draftKeys.list("pending"),
        (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.filter((x) => x.id !== draft.id) })) },
      );
    },
    // On failure the settle below refetches the queue, which brings the draft back. (Restoring a
    // snapshot instead would also undo other decisions made in the meantime.)
    onError: (e) => callbacks.onError?.(e),
    onSettled: (_r, _e, draft) => {
      void qc.invalidateQueries({ queryKey: draftKeys.all });
      void qc.invalidateQueries({ queryKey: inboxKeys.threads(draft.inbox_id) });
      void qc.invalidateQueries({ queryKey: messageKeys.all });
      void qc.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}

export const useApproveDraft = (callbacks: DecisionCallbacks = {}) => useDecision((id) => send0.drafts.send(id), callbacks);
export const useRejectDraft = (callbacks: DecisionCallbacks = {}) => useDecision((id) => send0.drafts.reject(id), callbacks);

export function useUpdateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...params }: UpdateDraftParams & { id: string }) => send0.drafts.update(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKeys.list("pending") }),
  });
}
