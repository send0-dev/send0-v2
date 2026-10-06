import { Progress } from "@/components/ui/progress";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "12 / 50" with a bar that turns amber near the limit and red at it. */
export function UsageMeter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = limit ? (used / limit) * 100 : 0;
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-foreground";
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="tabular text-[13px]">
          <span className="text-lg font-semibold tracking-tight">{formatCount(used)}</span>
          <span className="text-muted-foreground"> / {formatCount(limit)}</span>
        </span>
      </div>
      <Progress value={pct} indicatorClassName={cn(tone)} aria-label={`${label}: ${used} of ${limit}`} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
