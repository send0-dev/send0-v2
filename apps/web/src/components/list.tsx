import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A dense list of rows, Linear-style: no boxes, hairline separators, hover and selection states. */
export function List({ className, ...props }: ComponentProps<"div">) {
  return <div role="list" className={cn("flex flex-col", className)} {...props} />;
}

/** A sticky group heading inside a list ("Today", "Yesterday", …) with an optional count. */
export function ListGroupHeader({ label, count, className }: { label: ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn("sticky top-0 z-10 flex h-8 items-center gap-2 border-b bg-panel/95 px-5 text-xs font-medium text-muted-foreground backdrop-blur", className)}>
      {label}
      {count !== undefined && <span className="tabular text-faint">{count}</span>}
    </div>
  );
}

const rowClasses = (selected?: boolean, interactive = true) =>
  cn(
    "group/row relative flex min-h-11 w-full min-w-0 items-center gap-3 border-b border-border/60 px-5 text-left text-[13px] transition-colors duration-75 outline-none last:border-b-0",
    interactive && "cursor-pointer hover:bg-hover focus-visible:bg-hover",
    selected && "bg-selected hover:bg-selected"
  );

/** One row. Renders as a button when clickable, so it's reachable by keyboard. */
export function ListRow({ selected, onClick, className, children, ...props }: Omit<ComponentProps<"div">, "onClick"> & { selected?: boolean; onClick?: () => void }) {
  if (onClick) {
    return (
      <div role="listitem" className="contents">
        <button type="button" data-selected={selected || undefined} aria-current={selected || undefined} onClick={onClick} className={cn(rowClasses(selected), className)} {...(props as ComponentProps<"button">)}>
          {children}
        </button>
      </div>
    );
  }
  return (
    <div role="listitem" className={cn(rowClasses(selected, false), className)} {...props}>
      {children}
    </div>
  );
}

/** Actions that appear on the right of a row when it's hovered or focused. */
export function RowActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-state=open]]:opacity-100", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      {...props}
    />
  );
}
