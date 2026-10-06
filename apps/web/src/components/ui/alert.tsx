import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative flex w-full gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-card text-foreground [&>svg]:text-muted-foreground",
      destructive: "border-destructive/25 bg-destructive-soft text-destructive",
      warning: "border-warning/25 bg-warning-soft text-warning",
      success: "border-success/25 bg-success-soft text-success",
      info: "border-info/25 bg-info-soft text-info",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={variant === "destructive" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("opacity-90 [&_p]:leading-relaxed", className)} {...props} />;
}
