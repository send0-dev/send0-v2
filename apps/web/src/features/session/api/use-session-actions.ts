import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { authClient, type Me } from "@/lib/auth-client";
import { sessionKeys } from "./keys";

/** Reloads "me" and drops every other cached query: they belong to the previous user or workspace. */
export function useResetSession() {
  const qc = useQueryClient();
  return async () => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKeys.me[0] });
    await qc.invalidateQueries({ queryKey: sessionKeys.me });
  };
}

const SIGNED_OUT: Me = { user: null, workspace: null, workspaces: [] };

/**
 * Marks the session signed out first, so the route guard takes the app shell down before any
 * signed-in component re-renders without a user; then drops the cached data and goes to login.
 */
export function useLogOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authClient.logOut,
    onSuccess: () => {
      qc.setQueryData(sessionKeys.me, SIGNED_OUT);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKeys.me[0] });
      void navigate("/login", { replace: true });
    },
  });
}

export function useSwitchWorkspace() {
  const reset = useResetSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authClient.switchWorkspace,
    onSuccess: async () => {
      await reset();
      void navigate("/", { replace: true });
    },
  });
}

export function useCreateWorkspace() {
  const reset = useResetSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authClient.createWorkspace,
    onSuccess: async () => {
      await reset();
      void navigate("/", { replace: true });
    },
  });
}
