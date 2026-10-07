import { Inbox, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CodeBlock } from "@/components/code-block";
import { EmptyState } from "@/components/empty-state";
import { ListFilter, ListHint, PaneBar } from "@/components/list";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageBody, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useListNavigation } from "@/lib/use-list-navigation";
import { useMailDomain } from "@/features/session/api/use-instance";
import { useInboxes } from "../api/use-inboxes";
import { CreateInboxDialog } from "../components/create-inbox-dialog";
import { InboxesList } from "../components/inboxes-list";

export default function InboxesPage() {
  const inboxes = useInboxes();
  const domain = useMailDomain();
  const canManage = useCan("inbox.manage");
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? inboxes.items.filter((i) => i.address.includes(q) || i.display_name?.toLowerCase().includes(q)) : inboxes.items;
  }, [inboxes.items, filter]);
  useHotkeys({ c: () => canManage && setCreating(true), "/": () => document.getElementById("inbox-filter")?.focus() });
  useListNavigation({ ids: visible.map((i) => i.id), current: cursor, onMove: setCursor, onOpen: (id) => void navigate(`/inboxes/${id}`) });
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
          empty={
            <EmptyState
              icon={Inbox}
              title="No inboxes yet"
              description="An inbox is a real address your agent can receive, wait on and reply from."
              action={newInbox}
            />
          }
        >
          {(items) => (
            <>
              <PaneBar>
                <ListFilter id="inbox-filter" value={filter} onChange={setFilter} placeholder="Filter inboxes" />
                <span className="tabular ml-auto">{pluralize(visible.length, "inbox", "inboxes")}</span>
              </PaneBar>
              <InboxesList inboxes={visible} cursor={cursor} />
              <LoadMore
                hasNextPage={inboxes.hasNextPage}
                isFetchingNextPage={inboxes.isFetchingNextPage}
                fetchNextPage={() => void inboxes.fetchNextPage()}
              />
              {items.length < 6 && (
                <ListHint title="Agents can create their own inboxes">
                  <CodeBlock code={`await send0.inboxes.create({ name: "signup-agent" });\n// → signup-agent@${domain}`} />
                </ListHint>
              )}
            </>
          )}
        </QueryState>
      </PageBody>
      <CreateInboxDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
