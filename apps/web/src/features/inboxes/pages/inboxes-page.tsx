import { Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { TableSkeleton } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCan } from "@/lib/permissions";
import { useInboxes } from "../api/use-inboxes";
import { CreateInboxDialog } from "../components/create-inbox-dialog";
import { InboxesTable } from "../components/inboxes-table";

export default function InboxesPage() {
  const inboxes = useInboxes();
  const canManage = useCan("inbox.manage");
  const [creating, setCreating] = useState(false);
  const newInbox = canManage && (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      New inbox
    </Button>
  );
  return (
    <>
      <PageHeader title="Inboxes" description="Each inbox is a real address your agents can receive, wait on and reply from." actions={newInbox} />
      <Card>
        <QueryState
          query={inboxes.state}
          skeleton={<TableSkeleton columns={3} />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState icon={Inbox} title="No inboxes yet" description="Create one, or call POST /v1/inboxes from your agent." action={newInbox} />}
        >
          {(items) => (
            <>
              <InboxesTable inboxes={items} />
              <LoadMore hasNextPage={inboxes.hasNextPage} isFetchingNextPage={inboxes.isFetchingNextPage} fetchNextPage={() => void inboxes.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </Card>
      <CreateInboxDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
