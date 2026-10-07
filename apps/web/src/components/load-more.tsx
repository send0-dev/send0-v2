import { Button } from "@/components/ui/button";

/** "Load more" for cursor-paginated lists. Renders nothing when there's no next page. */
export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center border-t p-3">
      <Button variant="ghost" size="sm" loading={isFetchingNextPage} onClick={fetchNextPage}>
        Load more
      </Button>
    </div>
  );
}
