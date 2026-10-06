import type { Stats } from "@send0/sdk";
import { BarChart } from "@/components/charts/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SERIES = [
  { key: "received", label: "Received", color: "var(--chart-2)" },
  { key: "sent", label: "Sent", color: "var(--chart-1)" },
  { key: "bounced", label: "Bounced", color: "var(--chart-4)" },
];

/** Mail per day, stacked by direction, with a readout on hover. */
export function VolumeChart({ stats }: { stats: Stats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mail volume</CardTitle>
        <span className="text-xs text-faint">Last 14 days · UTC</span>
      </CardHeader>
      <CardContent>
        <BarChart data={stats.days.map((d) => ({ label: d.date, values: { received: d.received, sent: d.sent, bounced: d.bounced } }))} series={SERIES} />
      </CardContent>
    </Card>
  );
}
