import type { Stats } from "@send0/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { deliveryRate, halfOverHalf } from "../stats-math";
import { StatTile } from "./stat-tile";

const GRID = "grid grid-cols-2 gap-3 @md:gap-4 @3xl:grid-cols-4";

export function StatTiles({ stats }: { stats: Stats }) {
  const rate = deliveryRate(stats);
  const span = `${stats.days.length} days`;
  const vs = `Last ${Math.floor(stats.days.length / 2)} days vs the ${Math.floor(stats.days.length / 2)} before`;
  return (
    <div className={GRID}>
      <StatTile
        label="Received"
        value={formatCount(stats.totals.received)}
        change={halfOverHalf(stats, "received")}
        changeLabel={vs}
        spark={stats.days.map((d) => d.received)}
        color="var(--chart-2)"
        hint={`Last ${span}`}
      />
      <StatTile
        label="Sent"
        value={formatCount(stats.totals.sent)}
        change={halfOverHalf(stats, "sent")}
        changeLabel={vs}
        spark={stats.days.map((d) => d.sent)}
        color="var(--chart-1)"
        hint={`Last ${span}`}
      />
      <StatTile
        label="Delivered"
        value={rate === null ? "—" : `${rate}%`}
        spark={stats.days.map((d) => d.delivered)}
        color="var(--chart-3)"
        hint={
          rate === null
            ? stats.totals.sent
              ? "Waiting for delivery reports"
              : "Nothing sent yet"
            : `${formatCount(stats.totals.delivered)} delivered`
        }
      />
      <StatTile
        label="Bounced"
        value={formatCount(stats.totals.bounced)}
        spark={stats.days.map((d) => d.bounced)}
        color="var(--chart-4)"
        hint="Includes spam reports"
      />
    </div>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className={GRID}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[116px] rounded-lg" />
      ))}
    </div>
  );
}
