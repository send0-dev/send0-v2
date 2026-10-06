import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex items-center gap-2 rounded-md bg-elevated px-2 py-1 text-xs text-foreground shadow-elevated animate-in fade-in-0 zoom-in-[0.97] data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** A tooltip around any element, optionally with its keyboard shortcut. */
export function Tooltip({ content, shortcut, children, side }: { content: ReactNode; shortcut?: string; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>
        {content}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
