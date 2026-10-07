import { Send } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { PaneBar } from "@/components/list";
import { Page, PageBody, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeliveries, type DeliveryFilter } from "../api/use-deliveries";
import { useWebhook } from "../api/use-webhooks";
import { DeliveriesList } from "../components/deliveries-list";
import { WebhookActions } from "../components/webhook-actions";
import { eventSummary } from "../event-summary";

/** One endpoint: what it receives, its actions, and the delivery log with replay. */
export default function WebhookPage() {
  const { webhookId = "" } = useParams();
  const hook = useWebhook(webhookId);
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const deliveries = useDeliveries(webhookId, filter);
  return (
    <Page>
      <PageHeader actions={hook.data && <WebhookActions webhook={hook.data} />} />
      <PageBody>
        <QueryState query={hook} skeleton={<Skeleton className="m-5 h-16" />}>
          {(w) => (
            <div className="animate-enter border-b px-gutter py-5">
              <div className="flex items-center gap-1">
                <h1 className="truncate font-mono text-[15px] font-medium">{w.url}</h1>
                <CopyButton value={w.url} label="Copy URL" size="icon-xs" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <StatusBadge status={w.status} />
                <span>{eventSummary(w.events)}</span>
                <span className="font-mono text-faint">{w.id}</span>
              </div>
            </div>
          )}
        </QueryState>
        <PaneBar className="justify-between">
          <span className="font-medium text-foreground">Deliveries</span>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as DeliveryFilter)}>
            <TabsList aria-label="Delivery status">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="succeeded">Succeeded</TabsTrigger>
            </TabsList>
          </Tabs>
        </PaneBar>
        <QueryState
          query={deliveries.state}
          skeleton={<ListSkeleton rows={5} />}
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              icon={Send}
              title="No deliveries"
              description={filter === "all" ? "Send a test event to see what your endpoint receives." : `No ${filter} deliveries.`}
            />
          }
        >
          {(items) => (
            <>
              <DeliveriesList webhookId={webhookId} deliveries={items} />
              <LoadMore
                hasNextPage={deliveries.hasNextPage}
                isFetchingNextPage={deliveries.isFetchingNextPage}
                fetchNextPage={() => void deliveries.fetchNextPage()}
              />
            </>
          )}
        </QueryState>
      </PageBody>
    </Page>
  );
}
