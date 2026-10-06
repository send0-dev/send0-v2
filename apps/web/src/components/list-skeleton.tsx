import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder rows shaped like a list while it loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b border-border/60 px-gutter">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${30 + ((i * 17) % 35)}%` }} />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
