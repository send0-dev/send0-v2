import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClasses, "field-sizing-content min-h-20 px-2.5 py-2 leading-relaxed", className)} {...props} />;
}
