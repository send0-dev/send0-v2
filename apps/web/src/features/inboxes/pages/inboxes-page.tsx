import { Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageBody, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useListNavigation } from "@/lib/use-list-navigation";
import { useInboxes } from "../api/use-inboxes";
import { CreateInboxDialog } from "../components/create-inbox-dialog";
import { InboxesList } from "../components/inboxes-list";

export default function InboxesPage() {
  const inboxes = useInboxes();
  const canManage = useCan("inbox.manage");
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  useHotkeys({ c: () => canManage && setCreating(true) });
  useListNavigation({ ids: inboxes.items.map((i) => i.id), current: cursor, onMove: setCursor, onOpen: (id) => navigate(`/inboxes/${id}`) });
  const newInbox = canManage && (
    <Button variant="primary" size="sm" onClick={() => setCreating(true)} shortcut="C">
      <Plus />
      New inbox
    </Button>
  );
  return (
    <Page>
      <PageHeader actions={newInbox} />
      <PageBody>
        <QueryState
          query={inboxes.state}
          skeleton={<ListSkeleton />}
          isEmpty={(items) => items.length === 0}
          empty={<EmptyState icon={Inbox} title="No inboxes yet" description="An inbox is a real address your agent can receive, wait on and reply from." action={newInbox} />}
        >
          {(items) => (
            <>
              <InboxesList inboxes={items} cursor={cursor} />
              <LoadMore hasNextPage={inboxes.hasNextPage} isFetchingNextPage={inboxes.isFetchingNextPage} fetchNextPage={() => void inboxes.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </PageBody>
      <CreateInboxDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
