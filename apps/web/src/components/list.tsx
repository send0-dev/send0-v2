import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A dense list of rows, Linear-style: no boxes, hairline separators, hover and selection states. */
export function List({ className, ...props }: ComponentProps<"div">) {
  return <div role="list" className={cn("flex flex-col", className)} {...props} />;
}

/** A sticky group heading inside a list ("Today", "Yesterday", …) with an optional count. */
export function ListGroupHeader({ label, count, className }: { label: ReactNode; count?: number; className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex h-8 items-center gap-2 border-b bg-panel/95 px-gutter text-xs font-medium text-muted-foreground backdrop-blur",
        className,
      )}
    >
      {label}
      {count !== undefined && <span className="tabular text-faint">{count}</span>}
    </div>
  );
}

const rowClasses = (selected?: boolean, interactive = true) =>
  cn(
    "group/row relative flex min-h-11 w-full min-w-0 items-center gap-3 border-b border-border/60 px-gutter text-left text-[13px] transition-colors duration-75 outline-none last:border-b-0",
    interactive && "cursor-pointer hover:bg-hover focus-visible:bg-hover",
    selected && "bg-selected hover:bg-selected",
  );

/** One row. Renders as a button when clickable, so it's reachable by keyboard. */
export function ListRow({
  selected,
  onClick,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "onClick"> & { selected?: boolean; onClick?: () => void }) {
  if (onClick) {
    return (
      <div role="listitem" className="contents">
        <button
          type="button"
          data-selected={selected || undefined}
          aria-current={selected || undefined}
          onClick={onClick}
          className={cn(rowClasses(selected), className)}
          {...(props as ComponentProps<"button">)}
        >
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
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      {...props}
    />
  );
}

/** A 44px bar above a list or pane: counts, filters, view controls. Same height everywhere. */
export function PaneBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-gutter text-xs text-muted-foreground", className)} {...props} />
  );
}

/** Column headings for a list. Give each heading the same width class as its cells so they line up. */
export function ListColumns({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("flex h-8 shrink-0 items-center gap-3 border-b px-gutter text-[11px] font-medium text-faint", className)}
      {...props}
    />
  );
}

/** A quiet tip under a short list: how to do the same thing from code, or what to do next. */
export function ListHint({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-gutter py-8", className)}>
      <div className="max-w-xl rounded-lg border border-dashed p-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/** A filter box for a list bar. */
export function ListFilter({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id?: string;
}) {
  return (
    <span className="relative flex h-full min-w-0 flex-1 items-center">
      <Search className="pointer-events-none absolute left-0 size-3.5 text-faint" />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (onChange(""), e.currentTarget.blur())}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full w-full max-w-72 bg-transparent pl-6 text-[13px] text-foreground outline-none placeholder:text-faint"
      />
    </span>
  );
}
