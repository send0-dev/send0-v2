import { Progress as ProgressPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Progress({ className, value, indicatorClassName, ...props }: ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn("relative h-1 w-full overflow-hidden rounded-full bg-selected", className)} {...props}>
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full flex-1 rounded-full bg-brand transition-transform duration-500 ease-out", indicatorClassName)}
        style={{ transform: `translateX(-${100 - Math.min(100, value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
