import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A keyboard key, e.g. ⌘K or J. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-[18px] min-w-[18px] select-none items-center justify-center gap-0.5 rounded-[4px] border border-border-strong bg-muted px-1 font-sans text-[11px] font-medium leading-none text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
