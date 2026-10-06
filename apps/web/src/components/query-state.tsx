import type { ReactNode } from "react";
import { ErrorState } from "@/components/error-state";

/** Anything shaped like a query result: useQuery, or a cursor list with `data` set to its items. */
export interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Renders one data region through its states: loading (a skeleton shaped like the content),
 * failed (with retry), empty, or the data.
 */
export function QueryState<T>({
  query,
  skeleton,
  empty,
  isEmpty,
  children,
}: {
  query: QueryLike<T>;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton}</>;
  // A failed background refetch keeps the data already on screen; only a failed first load shows the error.
  if (query.isError && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  if (empty && isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
