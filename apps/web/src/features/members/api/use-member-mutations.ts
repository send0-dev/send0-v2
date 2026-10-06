import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useResetSession } from "@/features/session/api/use-session-actions";
import { memberKeys } from "./keys";

function useMembersMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }) });
}

export const useInviteMember = () => useMembersMutation(authClient.invite);
export const useResendInvite = () => useMembersMutation(authClient.resendInvite);
export const useRevokeInvite = () => useMembersMutation(authClient.revokeInvite);
export const useRemoveMember = () => useMembersMutation(authClient.removeMember);
export const useChangeRole = () => useMembersMutation(({ userId, role }: { userId: string; role: "admin" | "member" }) => authClient.changeRole(userId, role));

/** Leaving moves the session to another workspace (or to onboarding), so everything reloads. */
export function useLeaveWorkspace() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.leaveWorkspace, onSuccess: reset });
}
