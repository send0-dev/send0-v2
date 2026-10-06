import type { Usage } from "@send0/sdk";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { UsageMeter } from "./usage-meter";

const PLAN = { free: "Free", pro: "Pro", scale: "Scale" } as const;

export function UsageCard({ usage }: { usage: Usage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <Badge variant="outline">{PLAN[usage.plan]} plan</Badge>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <UsageMeter label="Sent today" used={usage.sends_today.used} limit={usage.sends_today.limit} hint={`Resets ${relativeTime(usage.sends_today.resets_at)}`} />
        <UsageMeter label="Inboxes" used={usage.inboxes.used} limit={usage.inboxes.limit} />
      </CardContent>
    </Card>
  );
}
