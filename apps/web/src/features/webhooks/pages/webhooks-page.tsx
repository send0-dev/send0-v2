import { Plus, Webhook } from "lucide-react";
import { useState } from "react";
import { TableSkeleton } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWebhooks } from "../api/use-webhooks";
import { CreateWebhookDialog } from "../components/create-webhook-dialog";
import { WebhooksTable } from "../components/webhooks-table";

export default function WebhooksPage() {
  const hooks = useWebhooks();
  const [creating, setCreating] = useState(false);
  const add = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      Add endpoint
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Webhooks"
        description={
          <>
            Signed POSTs for new mail and delivery events.{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="https://send0.dev/docs/realtime/webhooks" target="_blank" rel="noreferrer">
              How to verify them
            </a>
          </>
        }
        actions={add}
      />
      <Card>
        <QueryState
          query={hooks.state}
          skeleton={<TableSkeleton columns={4} rows={3} />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState icon={Webhook} title="No webhooks yet" description="Add an HTTPS endpoint to get a POST every time an inbox receives mail." action={add} />}
        >
          {(items) => (
            <>
              <WebhooksTable webhooks={items} />
              <LoadMore hasNextPage={hooks.hasNextPage} isFetchingNextPage={hooks.isFetchingNextPage} fetchNextPage={() => void hooks.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </Card>
      <CreateWebhookDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
