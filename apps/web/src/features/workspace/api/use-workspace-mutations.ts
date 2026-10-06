import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "@/features/session/api/keys";
import { useResetSession } from "@/features/session/api/use-session-actions";
import { memberKeys } from "@/features/members/api/keys";

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: authClient.renameWorkspace, onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.me }) });
}

export function useTransferWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authClient.transferWorkspace,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      void qc.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

/** After deleting, the session falls back to another workspace (or onboarding), so everything reloads. */
export function useDeleteWorkspace() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.deleteWorkspace, onSuccess: reset });
}
