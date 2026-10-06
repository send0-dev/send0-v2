import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Progress through onboarding: done, current, and upcoming steps. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-10 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Setup progress">
      {steps.map((label, i) => (
        <li key={label} className="grid gap-2" aria-current={i === current ? "step" : undefined}>
          <div className={cn("h-0.5 rounded-full", i <= current ? "bg-foreground" : "bg-border")} />
          <span className={cn("flex items-center gap-1.5 text-xs", i === current ? "font-medium text-foreground" : "text-muted-foreground")}>
            {i < current ? <Check className="size-3 text-success" /> : <span className="tabular">{i + 1}</span>}
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
