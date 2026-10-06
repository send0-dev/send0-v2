import { Page, PageBody, PageContent, PageHeader, PageTitle } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useChecklist } from "../api/use-checklist";
import { useStats } from "../api/use-stats";
import { useUsage } from "../api/use-usage";
import { ActivityFeed } from "../components/activity-feed";
import { InboxesCard } from "../components/inboxes-card";
import { LimitsCard } from "../components/limits-card";
import { PendingDraftsBanner } from "../components/pending-drafts-banner";
import { RangePicker } from "../components/range-picker";
import { SendingPausedAlert } from "../components/sending-paused-alert";
import { SetupChecklist } from "../components/setup-checklist";
import { StatTiles, StatTilesSkeleton } from "../components/stat-tiles";
import { VolumeChart } from "../components/volume-chart";
import { useRange } from "../use-range";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

/**
 * The workspace at a glance, on one grid (24px gaps, the shared gutter):
 *   title
 *   alerts (paused sending, drafts waiting)
 *   4 stat tiles
 *   volume chart (2/3) | limits + setup (1/3), equal height
 *   activity (2/3)     | inboxes (1/3), equal height
 */
export default function OverviewPage() {
  const { user, workspace } = useCurrentWorkspace();
  const [range, setRange] = useRange();
  const usage = useUsage();
  const stats = useStats(range);
  const checklist = useChecklist();
  // With setup finished the checklist disappears, so Limits stretches to keep both columns level.
  const setupDone = !checklist || checklist.every((i) => i.done);
  return (
    <Page>
      <PageHeader actions={<RangePicker value={range} onChange={setRange} />} />
      <PageBody>
        <PageContent className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <PageTitle title={`${greeting()}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`} description={`Here's what's happening in ${workspace.name} over the last ${range} days.`} />

          {usage.data?.sending.paused && <SendingPausedAlert sending={usage.data.sending} />}
          <PendingDraftsBanner />

          <QueryState query={stats} skeleton={<StatTilesSkeleton />}>
            {(s) => <StatTiles stats={s} />}
          </QueryState>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @3xl:grid-cols-3">
            <div className="@3xl:col-span-2">
              <QueryState query={stats} skeleton={<Skeleton className="h-[320px] rounded-lg" />}>
                {(s) => <VolumeChart stats={s} />}
              </QueryState>
            </div>
            <div className="flex flex-col gap-6">
              <QueryState query={usage} skeleton={<Skeleton className="h-[150px] rounded-lg" />}>
                {(u) => <LimitsCard usage={u} className={setupDone ? "flex-1" : undefined} />}
              </QueryState>
              {!setupDone && <SetupChecklist items={checklist!} className="flex-1" />}
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @3xl:grid-cols-3">
            <ActivityFeed className="@3xl:col-span-2" />
            <InboxesCard />
          </div>
        </PageContent>
      </PageBody>
    </Page>
  );
}
