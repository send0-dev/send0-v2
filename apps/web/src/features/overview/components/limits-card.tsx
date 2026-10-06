import type { Usage } from "@send0/sdk";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCount, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLAN = { free: "Free plan", pro: "Pro plan", scale: "Scale plan" } as const;

function Meter({ label, used, limit, hint }: { label: string; used: number; limit: number; hint?: string }) {
  const pct = limit ? (used / limit) * 100 : 0;
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-brand";
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular">
          <span className="font-medium text-foreground">{formatCount(used)}</span>
          <span className="text-faint"> / {formatCount(limit)}</span>
        </span>
      </div>
      <Progress value={pct} indicatorClassName={tone} aria-label={`${label}: ${used} of ${limit}`} />
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

/** Where the workspace stands against its plan today. */
export function LimitsCard({ usage, className }: { usage: Usage; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Limits</CardTitle>
        <Badge variant="outline">{PLAN[usage.plan]}</Badge>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Meter label="Sent today" used={usage.sends_today.used} limit={usage.sends_today.limit} hint={`Resets ${relativeTime(usage.sends_today.resets_at)}`} />
        <Meter label="Inboxes" used={usage.inboxes.used} limit={usage.inboxes.limit} />
      </CardContent>
    </Card>
  );
}
