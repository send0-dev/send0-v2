import { Send } from "lucide-react";
import { useParams } from "react-router";
import { TableSkeleton } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { QueryState } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useDeliveries, type DeliveryFilter } from "../api/use-deliveries";
import { useWebhook } from "../api/use-webhooks";
import { DeliveriesTable } from "../components/deliveries-table";
import { WebhookActions } from "../components/webhook-actions";
import { eventSummary } from "../event-summary";

/** One endpoint: its settings and the delivery log, with replay. */
export default function WebhookPage() {
  const { webhookId = "" } = useParams();
  const hook = useWebhook(webhookId);
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const deliveries = useDeliveries(webhookId, filter);
  return (
    <QueryState query={hook} skeleton={<Skeleton className="h-10 w-96" />}>
      {(w) => (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate font-mono text-base font-semibold">{w.url}</h1>
              <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                <StatusBadge status={w.status} />
                <span>{eventSummary(w.events)}</span>
                <span className="font-mono text-xs">{w.id}</span>
              </div>
            </div>
            <WebhookActions webhook={w} />
          </div>
          <Card>
            <CardHeader className="items-center">
              <CardTitle>Deliveries</CardTitle>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as DeliveryFilter)}>
                <TabsList className="border-0">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="failed">Failed</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="succeeded">Succeeded</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <QueryState
              query={deliveries.state}
              skeleton={<TableSkeleton columns={5} />}
              isEmpty={(items) => items.length === 0}
              empty={<EmptyState icon={Send} title="No deliveries" description={filter === "all" ? "Send a test event to see one here." : `No ${filter} deliveries.`} />}
            >
              {(items) => (
                <>
                  <DeliveriesTable webhookId={w.id} deliveries={items} />
                  <LoadMore hasNextPage={deliveries.hasNextPage} isFetchingNextPage={deliveries.isFetchingNextPage} fetchNextPage={() => void deliveries.fetchNextPage()} />
                </>
              )}
            </QueryState>
          </Card>
        </>
      )}
    </QueryState>
  );
}
