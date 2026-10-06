import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "./keys";

/** Who is signed in, and which workspace they're looking at. */
export function useMe() {
  return useQuery({ queryKey: sessionKeys.me, queryFn: authClient.me, staleTime: 60_000 });
}

/** The signed-in user and workspace, for components that only render inside the app shell. */
export function useCurrentWorkspace() {
  const { data } = useMe();
  if (!data?.user || !data.workspace) throw new Error("useCurrentWorkspace used outside a workspace");
  return { user: data.user, workspace: data.workspace, workspaces: data.workspaces };
}
