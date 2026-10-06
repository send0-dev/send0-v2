import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const fieldClasses =
  "w-full min-w-0 rounded-md border border-input bg-transparent text-[13px] shadow-[0_1px_1px_rgb(0_0_0/0.03)] outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-border-strong focus-visible:border-brand/60 focus-visible:ring-[3px] focus-visible:ring-brand/15 aria-invalid:border-destructive/70 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.02]";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, "h-8 px-2.5", className)} {...props} />;
}
