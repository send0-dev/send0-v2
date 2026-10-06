import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { setActiveWorkspace } from "@/lib/active-workspace";
import { toAppError } from "@/lib/api";
import type { Me } from "@/lib/auth-client";
import { sessionKeys } from "@/features/session/api/keys";

/**
 * Reads retry twice on network errors and 5xx, never on 4xx. Any 401 means the session ended:
 * refetching "me" lets the route guards send the user to the login page. A 409
 * workspace_changed means the session moved to another workspace (another tab): refetching
 * "me" picks that up, and the workspace watcher below drops everything cached for the old one.
 */
export function createQueryClient() {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (err) => onAuthError(err) }),
    mutationCache: new MutationCache({ onError: (err) => onAuthError(err) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          const { status } = toAppError(err);
          return count < 2 && (status === 0 || status >= 500);
        },
      },
      mutations: { retry: false },
    },
  });
  const onAuthError = (err: unknown) => {
    const e = toAppError(err);
    if (e.status === 401 || e.code === "workspace_changed") void client.invalidateQueries({ queryKey: sessionKeys.me });
  };
  watchWorkspace(client);
  return client;
}

/**
 * Keeps requests tagged with the workspace "me" says we're in, and when that workspace changes,
 * drops every cached query that belonged to the previous one.
 */
function watchWorkspace(client: QueryClient) {
  let known: string | null | undefined;
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== sessionKeys.me[0]) return;
    const id = (event.query.state.data as Me | undefined)?.workspace?.id ?? null;
    if (id === known) return;
    const switched = known !== undefined;
    known = id;
    setActiveWorkspace(id);
    if (switched) client.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKeys.me[0] });
  });
}
