import type { ApiKey } from "@send0/sdk";
import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { TableSkeleton } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApiKeys } from "../api/use-api-keys";
import { ApiKeysTable } from "../components/api-keys-table";
import { CreateApiKeyDialog } from "../components/create-api-key-dialog";
import { RevokeApiKeyDialog } from "../components/revoke-api-key-dialog";

export default function ApiKeysPage() {
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const newKey = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      New key
    </Button>
  );
  return (
    <>
      <PageHeader title="API keys" description="Give each agent its own key, limited to its own inbox." actions={newKey} />
      <Card>
        <QueryState
          query={keys.state}
          skeleton={<TableSkeleton columns={5} />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState icon={KeyRound} title="No API keys" description="Create a key to call send0 from your code, SDKs or MCP server." action={newKey} />}
        >
          {(items) => (
            <>
              <ApiKeysTable keys={items} onRevoke={setRevoking} />
              <LoadMore hasNextPage={keys.hasNextPage} isFetchingNextPage={keys.isFetchingNextPage} fetchNextPage={() => void keys.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </Card>
      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeApiKeyDialog apiKey={revoking} onOpenChange={(o) => !o && setRevoking(null)} />
    </>
  );
}
