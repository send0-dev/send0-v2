import { Mail, SearchX } from "lucide-react";
import { useMemo } from "react";
import { TableSkeleton } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useMessages } from "../api/use-messages";
import { MessageFilters } from "../components/message-filters";
import { MessageSheet } from "../components/message-sheet";
import { MessagesTable } from "../components/messages-table";
import { useApiFilters, useMessageFilters, useOpenMessage } from "../use-message-filters";

/** Every message across the workspace's inboxes, filterable, with a detail view. */
export default function MessagesPage() {
  const { filters, setFilter, clear, active } = useMessageFilters();
  const messages = useMessages(useApiFilters(filters));
  const [openId, setOpenId] = useOpenMessage();
  const inboxes = useInboxes();
  const addressOf = useMemo(() => {
    const map = new Map(inboxes.items.map((i) => [i.id, i.address]));
    return (id: string) => map.get(id);
  }, [inboxes.items]);

  return (
    <>
      <PageHeader title="Messages" description="Everything your inboxes have sent and received." />
      <Card>
        <MessageFilters filters={filters} onChange={setFilter} onClear={clear} active={active} />
        <QueryState
          query={messages.state}
          skeleton={<TableSkeleton rows={8} columns={5} />}
          isEmpty={(items) => items.length === 0}
          empty={
            active ? (
              <EmptyState icon={SearchX} title="No messages match" description="Try fewer filters." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={Mail} title="No messages yet" description="Mail your inboxes send and receive will show up here." />
            )
          }
        >
          {(items) => (
            <>
              <MessagesTable messages={items} onOpen={(m) => setOpenId(m.id)} inboxAddress={addressOf} />
              <LoadMore hasNextPage={messages.hasNextPage} isFetchingNextPage={messages.isFetchingNextPage} fetchNextPage={() => void messages.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </Card>
      <MessageSheet messageId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
