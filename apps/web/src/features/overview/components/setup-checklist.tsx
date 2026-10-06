import { Check, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  label: string;
  done: boolean;
  to: string;
}

function Ring({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 50.3} 50.3`} className="transition-[stroke-dasharray] duration-700" />
    </svg>
  );
}

/** First steps as a compact checklist; disappears once they're all done. */
export function SetupChecklist({ items, className }: { items: ChecklistItem[]; className?: string }) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Get set up</CardTitle>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">
            {done}/{items.length}
          </span>
          <Ring pct={(done / items.length) * 100} />
        </span>
      </CardHeader>
      <ol className="px-2 pb-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link to={item.to} className="group flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors hover:bg-hover">
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", item.done ? "border-success bg-success text-white" : "border-border-strong")}>
                {item.done && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", item.done && "text-faint line-through decoration-faint/60")}>{item.label}</span>
              {!item.done && <ChevronRight className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
