import type { Stats } from "@send0/sdk";
import { BarChart } from "@/components/charts/bar-chart";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const SERIES = [
  { key: "received", label: "Received", color: "var(--chart-2)" },
  { key: "sent", label: "Sent", color: "var(--chart-1)" },
  { key: "bounced", label: "Bounced", color: "var(--chart-4)" },
];

/** Mail per day, stacked by direction, with a readout on hover. Fills the height of its row. */
export function VolumeChart({ stats }: { stats: Stats }) {
  return (
    <Card className="flex h-full min-h-[320px] flex-col">
      <CardHeader>
        <CardTitle>Mail volume</CardTitle>
        <span className="text-xs text-faint">Per day · UTC</span>
      </CardHeader>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <BarChart
          className="flex min-h-0 flex-1 flex-col"
          data={stats.days.map((d) => ({ label: d.date, values: { received: d.received, sent: d.sent, bounced: d.bounced } }))}
          series={SERIES}
        />
      </div>
    </Card>
  );
}
