import { Plus, Webhook } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { EmptyState } from "@/components/empty-state";
import { ListHint, PaneBar } from "@/components/list";
import { pluralize } from "@/lib/format";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageBody, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useWebhooks } from "../api/use-webhooks";
import { CreateWebhookDialog } from "../components/create-webhook-dialog";
import { WebhooksList } from "../components/webhooks-list";

export default function WebhooksPage() {
  const hooks = useWebhooks();
  const [creating, setCreating] = useState(false);
  useHotkeys({ c: () => setCreating(true) });
  const add = (
    <Button variant="primary" size="sm" onClick={() => setCreating(true)} shortcut="C">
      <Plus />
      Add endpoint
    </Button>
  );
  return (
    <Page>
      <PageHeader
        actions={
          <>
            <a
              className="text-xs text-muted-foreground hover:text-foreground max-sm:hidden"
              href="https://send0.dev/docs/realtime/webhooks"
              target="_blank"
              rel="noreferrer"
            >
              Verifying signatures ↗
            </a>
            {add}
          </>
        }
      />
      <PageBody>
        <QueryState
          query={hooks.state}
          skeleton={<ListSkeleton rows={3} />}
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              icon={Webhook}
              title="No endpoints yet"
              description="Get a signed POST the moment an inbox receives mail, a message is delivered or bounces, or a draft needs approval."
              action={add}
            />
          }
        >
          {(items) => (
            <>
              <PaneBar>
                <span>Signed POSTs for new mail, deliveries, bounces and drafts.</span>
                <span className="tabular ml-auto">{pluralize(items.length, "endpoint")}</span>
              </PaneBar>
              <WebhooksList webhooks={items} />
              <LoadMore
                hasNextPage={hooks.hasNextPage}
                isFetchingNextPage={hooks.isFetchingNextPage}
                fetchNextPage={() => void hooks.fetchNextPage()}
              />
              <ListHint title="Verify every delivery">
                <CodeBlock code={`const ok = await send0.webhooks.verify(rawBody, req.headers["send0-signature"], secret);`} />
              </ListHint>
            </>
          )}
        </QueryState>
      </PageBody>
      <CreateWebhookDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
