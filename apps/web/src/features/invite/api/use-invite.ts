import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { authClient } from "@/lib/auth-client";
import { useResetSession } from "@/features/session/api/use-session-actions";

export function useInvitePreview(token: string) {
  return useQuery({ queryKey: ["invite", token], queryFn: () => authClient.previewInvite(token), retry: false, staleTime: Infinity });
}

/** Joining switches the session to the workspace, so everything is reloaded and we go home. */
function useJoined() {
  const reset = useResetSession();
  const navigate = useNavigate();
  return async () => {
    await reset();
    void navigate("/", { replace: true });
  };
}

export function useAcceptInvite(token: string) {
  const joined = useJoined();
  return useMutation({ mutationFn: () => authClient.acceptInvite(token), onSuccess: joined });
}

export function useInviteSignUp(token: string) {
  const joined = useJoined();
  return useMutation({ mutationFn: (b: { name: string; password: string }) => authClient.signUpWithInvite(token, b), onSuccess: joined });
}
