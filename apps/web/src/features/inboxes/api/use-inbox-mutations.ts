import type { CreateInboxParams, Inbox, UpdateInboxParams } from "@send0/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { usageKeys } from "@/features/overview/api/keys";
import { inboxKeys } from "./keys";

export function useCreateInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInboxParams) => send0.inboxes.create(params),
    onSuccess: (inbox) => {
      qc.setQueryData(inboxKeys.detail(inbox.id), inbox);
      void qc.invalidateQueries({ queryKey: inboxKeys.list() });
      void qc.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}

export function useUpdateInbox(inboxId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: UpdateInboxParams) => send0.inboxes.update(inboxId, params),
    onSuccess: (inbox: Inbox) => {
      qc.setQueryData(inboxKeys.detail(inbox.id), inbox);
      void qc.invalidateQueries({ queryKey: inboxKeys.list() });
    },
  });
}

export function useDeleteInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inboxId: string) => send0.inboxes.delete(inboxId),
    onSuccess: (_r, inboxId) => {
      qc.removeQueries({ queryKey: inboxKeys.detail(inboxId) });
      void qc.invalidateQueries({ queryKey: inboxKeys.list() });
      void qc.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}
