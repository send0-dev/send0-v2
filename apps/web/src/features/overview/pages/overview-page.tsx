import { Page, PageBody, PageContent, PageHeader, PageTitle } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useChecklist } from "../api/use-checklist";
import { useStats } from "../api/use-stats";
import { useUsage } from "../api/use-usage";
import { ActivityFeed } from "../components/activity-feed";
import { GettingStarted } from "../components/getting-started";
import { LimitsCard } from "../components/limits-card";
import { PendingDraftsBanner } from "../components/pending-drafts-banner";
import { SendingPausedAlert } from "../components/sending-paused-alert";
import { StatTiles, StatTilesSkeleton } from "../components/stat-tiles";
import { VolumeChart } from "../components/volume-chart";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function OverviewPage() {
  const { user, workspace } = useCurrentWorkspace();
  const usage = useUsage();
  const stats = useStats(14);
  const checklist = useChecklist();
  return (
    <Page>
      <PageHeader />
      <PageBody>
        <PageContent className="grid gap-5">
          <PageTitle title={`${greeting()}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`} description={`Here's what's happening in ${workspace.name}.`} />
          {usage.data && <SendingPausedAlert sending={usage.data.sending} />}
          {checklist && <GettingStarted items={checklist} />}
          <PendingDraftsBanner />
          <QueryState query={stats} skeleton={<StatTilesSkeleton />}>
            {(s) => <StatTiles stats={s} />}
          </QueryState>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <QueryState query={stats} skeleton={<Skeleton className="h-[268px] rounded-lg" />}>
              {(s) => <VolumeChart stats={s} />}
            </QueryState>
            <QueryState query={usage} skeleton={<Skeleton className="h-[168px] rounded-lg" />}>
              {(u) => <LimitsCard usage={u} />}
            </QueryState>
          </div>
          <ActivityFeed />
        </PageContent>
      </PageBody>
    </Page>
  );
}
