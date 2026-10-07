import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Page } from "@send0/sdk";
import { useMemo } from "react";
import type { QueryLike } from "@/components/query-state";

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/** Plain-data copy of an SDK page, safe to keep in the query cache. */
export const toCursorPage = <T>(p: Page<T>): CursorPage<T> => ({ data: p.data, nextCursor: p.nextCursor });

/**
 * A cursor-paginated list as one flat array, with "load more". `fetchPage` receives the cursor
 * (undefined for the first page) and returns an SDK page.
 */
export function useCursorList<T>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  opts: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => toCursorPage(await fetchPage(pageParam)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...opts,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  /** The list as a plain query result for <QueryState>: data stays undefined until a page has loaded. */
  const state: QueryLike<T[]> = {
    data: query.data ? items : undefined,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
  return { ...query, items, state };
}
