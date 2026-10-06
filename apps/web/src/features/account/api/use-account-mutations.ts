import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "@/features/session/api/keys";

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: authClient.updateProfile, onSuccess: (me) => qc.setQueryData(sessionKeys.me, me) });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authClient.changePassword });
}

export function useRevokeOtherSessions() {
  return useMutation({ mutationFn: authClient.revokeOtherSessions });
}
