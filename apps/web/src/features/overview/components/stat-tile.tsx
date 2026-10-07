import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A headline number. Every tile has the same three rows, so a row of them lines up exactly:
 * label + change, the value, then a one-line hint with the sparkline on the right.
 */
export function StatTile({
  label,
  value,
  change,
  changeLabel,
  spark,
  color,
  hint,
}: {
  label: string;
  value: ReactNode;
  change?: number | null;
  changeLabel?: string;
  spark: number[];
  color: string;
  hint: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="grid h-[116px] min-w-0 grid-rows-[20px_1fr_28px] gap-1 rounded-lg border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        {change !== undefined && change !== null && (
          <Tooltip content={changeLabel}>
            <span
              className={cn(
                "tabular inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium",
                up ? "text-success" : "text-destructive",
              )}
            >
              {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(change)}%
            </span>
          </Tooltip>
        )}
      </div>
      <div className="tabular self-center text-[26px] leading-none font-semibold tracking-[-0.03em]">{value}</div>
      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0 truncate pb-0.5 text-[11px] text-faint">{hint}</span>
        <Sparkline values={spark} color={color} className="h-7 w-20 shrink-0 @max-md:hidden" />
      </div>
    </div>
  );
}
