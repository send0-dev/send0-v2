import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border-strong bg-transparent text-muted-foreground",
        success: "border-success/20 bg-success-soft text-success",
        warning: "border-warning/20 bg-warning-soft text-warning",
        destructive: "border-destructive/20 bg-destructive-soft text-destructive",
        info: "border-info/20 bg-info-soft text-info",
        brand: "border-brand/25 bg-brand-soft text-brand",
        outline: "border-border-strong text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
