import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-20 w-full rounded-md border border-input bg-card px-2.5 py-2 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-destructive disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
