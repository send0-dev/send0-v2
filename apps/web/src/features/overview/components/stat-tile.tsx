import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

/** A headline number with its trend: label, value, change vs last week, and a sparkline. */
export function StatTile({ label, value, change, spark, color, hint }: { label: string; value: ReactNode; change?: number | null; spark?: number[]; color?: string; hint?: string }) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {change !== undefined && change !== null && (
          <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular", up ? "text-success" : "text-destructive")}>
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="tabular text-[26px] leading-none font-semibold tracking-[-0.03em]">{value}</div>
          {hint && <div className="mt-1.5 text-[11px] text-faint">{hint}</div>}
        </div>
        {spark && <Sparkline values={spark} color={color} className="h-8 w-24 shrink-0" />}
      </div>
    </div>
  );
}
