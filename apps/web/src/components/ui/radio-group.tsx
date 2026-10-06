import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-2", className)} {...props} />;
}

/** A selectable card: title, description, and the radio dot. */
export function RadioCard({ className, title, description, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item> & { title: string; description?: string }) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "data-[state=checked]:border-foreground/60 data-[state=checked]:bg-accent/40",
        className
      )}
      {...props}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input">
        <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-foreground" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-[13px] font-medium">{title}</span>
        {description && <span className="text-[13px] text-muted-foreground">{description}</span>}
      </span>
    </RadioGroupPrimitive.Item>
  );
}
