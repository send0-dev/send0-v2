import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-2", className)} {...props} />;
}

/** A selectable card: title, description, and the radio dot. */
export function RadioCard({
  className,
  title,
  description,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item> & { title: string; description?: string }) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-transparent p-3 text-left transition-colors outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/40",
        "data-[state=checked]:border-brand/50 data-[state=checked]:bg-brand-soft/60",
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border-strong">
        <RadioGroupPrimitive.Indicator className="size-1.5 rounded-full bg-brand ring-[3px] ring-brand/25" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-[13px] font-medium">{title}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    </RadioGroupPrimitive.Item>
  );
}
