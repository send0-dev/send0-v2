import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useChecklist } from "../api/use-checklist";
import { useUsage } from "../api/use-usage";
import { GettingStartedCard } from "../components/getting-started-card";
import { PendingDraftsCard } from "../components/pending-drafts-card";
import { RecentMessagesCard } from "../components/recent-messages-card";
import { SendingPausedAlert } from "../components/sending-paused-alert";
import { UsageCard } from "../components/usage-card";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function OverviewPage() {
  const { user, workspace } = useCurrentWorkspace();
  const usage = useUsage();
  const checklist = useChecklist();
  return (
    <>
      <PageHeader title={`${greeting()}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`} description={workspace.name} />
      <div className="grid gap-5">
        {usage.data && <SendingPausedAlert sending={usage.data.sending} />}
        <PendingDraftsCard />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-5">
            <QueryState query={usage} skeleton={<Skeleton className="h-36" />}>
              {(u) => <UsageCard usage={u} />}
            </QueryState>
            <RecentMessagesCard />
          </div>
          {checklist && <GettingStartedCard items={checklist} />}
        </div>
      </div>
    </>
  );
}
