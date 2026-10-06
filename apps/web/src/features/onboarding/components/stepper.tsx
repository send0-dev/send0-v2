import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Progress through onboarding: numbered dots joined by a line that fills as steps complete. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-10 flex items-center" aria-label="Setup progress">
      {steps.map((label, i) => (
        <li key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")} aria-current={i === current ? "step" : undefined}>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                i < current && "border-brand bg-brand text-brand-foreground",
                i === current && "border-brand text-brand ring-4 ring-brand/15",
                i > current && "border-border-strong text-faint"
              )}
            >
              {i < current ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("text-xs whitespace-nowrap max-sm:hidden", i === current ? "font-medium text-foreground" : "text-faint")}>{label}</span>
          </span>
          {i < steps.length - 1 && (
            <span className="mx-3 h-px flex-1 bg-border-strong">
              <span className="block h-full bg-brand transition-[width] duration-500" style={{ width: i < current ? "100%" : "0%" }} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
