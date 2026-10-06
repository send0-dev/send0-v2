import type { Stats } from "@send0/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { deliveryRate, weekOverWeek } from "../stats-math";
import { StatTile } from "./stat-tile";

export function StatTiles({ stats }: { stats: Stats }) {
  const rate = deliveryRate(stats);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Received" value={formatCount(stats.totals.received)} change={weekOverWeek(stats, "received")} spark={stats.days.map((d) => d.received)} color="var(--chart-2)" hint="Last 14 days" />
      <StatTile label="Sent" value={formatCount(stats.totals.sent)} change={weekOverWeek(stats, "sent")} spark={stats.days.map((d) => d.sent)} color="var(--chart-1)" hint="Last 14 days" />
      <StatTile label="Delivered" value={rate === null ? "—" : `${rate}%`} spark={stats.days.map((d) => d.delivered)} color="var(--chart-3)" hint={rate === null ? (stats.totals.sent ? "Waiting for delivery reports" : "Nothing sent yet") : `${formatCount(stats.totals.delivered)} delivered`} />
      <StatTile label="Bounced" value={formatCount(stats.totals.bounced)} spark={stats.days.map((d) => d.bounced)} color="var(--chart-4)" hint="Bounces and spam reports" />
    </div>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[104px] rounded-lg" />
      ))}
    </div>
  );
}
