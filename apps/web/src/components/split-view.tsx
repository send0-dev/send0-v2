import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A list on the left and the open item on the right (Inbox, Drafts). Both panes start with a
 * 44px bar, so their tops line up; on phones only one pane shows at a time.
 *
 *   <SplitView detailOpen={!!id}>
 *     <ListPane bar={…}>…rows…</ListPane>
 *     <DetailPane bar={…} footer={…}>…content…</DetailPane>
 *   </SplitView>
 */
export function SplitView({ detailOpen, className, children }: { detailOpen: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-detail-open={detailOpen || undefined} className={cn("group/split flex min-h-0 flex-1", className)}>
      {children}
    </div>
  );
}

/** The bar at the top of a pane: same height on both sides. */
export function PaneBar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-gutter text-xs text-muted-foreground", className)} {...props} />;
}

export function ListPane({ bar, className, children, label }: { bar?: ReactNode; className?: string; children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className={cn("flex w-full min-w-0 flex-col border-r md:w-[360px] md:shrink-0 group-data-[detail-open]/split:max-md:hidden", className)}
    >
      {bar}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function DetailPane({ bar, footer, className, children, label }: { bar?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className={cn("flex min-w-0 flex-1 flex-col max-md:hidden group-data-[detail-open]/split:max-md:flex", className)}>
      {bar}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </section>
  );
}

/** Readable measure for the open item's content: left-aligned on the gutter, capped in width. */
export function DetailContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("w-full max-w-[760px] px-gutter py-6", className)} {...props} />;
}
