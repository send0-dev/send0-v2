import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useNavigate } from "react-router";
import { send0 } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "@/features/session/api/keys";
import { useResetSession } from "@/features/session/api/use-session-actions";

/** Step 1: create (or rename) the first workspace. */
export function useEnsureWorkspace() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: authClient.ensureFirstWorkspace, onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.me }) });
}

/**
 * Waits for the first email to arrive, like an agent would: long-polls `wait` and asks again
 * whenever a wait times out. Counts mail from a minute before the step opened.
 */
export function useFirstMessage(inboxId: string) {
  const since = useRef(new Date(Date.now() - 60_000).toISOString());
  return useQuery({
    queryKey: ["onboarding", "first-message", inboxId],
    queryFn: ({ signal }) => send0.inboxes.wait(inboxId, { timeout: 50, since: since.current }, { signal }),
    refetchInterval: (q) => (q.state.data || q.state.status === "error" ? false : 1),
    refetchIntervalInBackground: true,
    retry: 5,
    retryDelay: 3000,
    staleTime: Infinity,
  });
}

/** Marks onboarding done and lands on `destination` (the guard follows ?next= once the stage changes). */
export function useFinishOnboarding() {
  const reset = useResetSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (destination: string) => {
      await authClient.finishOnboarding();
      return destination;
    },
    onSuccess: async (destination) => {
      navigate(`/onboarding?next=${encodeURIComponent(destination)}`, { replace: true });
      await reset();
    },
  });
}
