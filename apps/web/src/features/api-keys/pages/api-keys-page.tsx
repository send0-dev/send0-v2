import type { ApiKey } from "@send0/sdk";
import { KeyRound, Plus } from "lucide-react";
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
import { useApiKeys } from "../api/use-api-keys";
import { ApiKeysList } from "../components/api-keys-list";
import { CreateApiKeyDialog } from "../components/create-api-key-dialog";
import { RevokeApiKeyDialog } from "../components/revoke-api-key-dialog";

export default function ApiKeysPage() {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  useHotkeys({ c: () => setCreating(true) });
  const newKey = (
    <Button variant="primary" size="sm" onClick={() => setCreating(true)} shortcut="C">
      <Plus />
      New key
    </Button>
  );
  return (
    <Page>
      <PageHeader actions={newKey} />
      <PageBody>
        <QueryState
          query={keys.state}
          skeleton={<ListSkeleton rows={3} />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState icon={KeyRound} title="No API keys" description="Give each agent its own key, limited to its own inbox, so one leak can't read the rest." action={newKey} />}
        >
          {(items) => (
            <>
              <PaneBar>
                <span>Give each agent its own key, limited to its own inbox.</span>
                <span className="tabular ml-auto">{pluralize(items.length, "key")}</span>
              </PaneBar>
              <ApiKeysList keys={items} onRevoke={setRevoking} />
              <LoadMore hasNextPage={keys.hasNextPage} isFetchingNextPage={keys.isFetchingNextPage} fetchNextPage={() => void keys.fetchNextPage()} />
              <ListHint title="Use a key">
                <CodeBlock code={`curl https://api.send0.dev/v1/inboxes \
  -H "Authorization: Bearer $SEND0_API_KEY"`} />
              </ListHint>
            </>
          )}
        </QueryState>
      </PageBody>
      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeApiKeyDialog apiKey={revoking} onOpenChange={(o) => !o && setRevoking(null)} />
    </Page>
  );
}
