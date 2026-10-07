import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}

/** Segmented control, like Linear's view switcher. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex h-7 w-fit items-center gap-0.5 rounded-md border bg-muted/60 p-0.5", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=active]:bg-elevated data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />;
}
