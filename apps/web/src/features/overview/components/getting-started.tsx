import { Check, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  label: string;
  done: boolean;
  to: string;
}

/** First steps as a row of cards; disappears once they're all done. */
export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const pct = Math.round((done / items.length) * 100);
  return (
    <section className="relative overflow-hidden rounded-xl border bg-card p-4">
      <div aria-hidden className="glow pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium">Get set up</h2>
          <p className="text-xs text-muted-foreground">
            {done} of {items.length} done
          </p>
        </div>
        <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-label={`${pct}% complete`}>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 94.2} 94.2`} className="transition-[stroke-dasharray] duration-700" />
        </svg>
      </div>
      <ol className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item, i) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className={cn(
                "group flex h-full items-center gap-2.5 rounded-lg border bg-panel/60 px-3 py-2.5 text-[13px] transition-colors hover:border-border-strong hover:bg-hover",
                item.done && "opacity-60"
              )}
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold", item.done ? "border-success bg-success text-white" : "border-border-strong text-faint")}>
                {item.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("min-w-0 flex-1", item.done && "line-through decoration-faint")}>{item.label}</span>
              {!item.done && <ChevronRight className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5" />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
