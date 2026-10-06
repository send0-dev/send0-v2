import type { Message } from "@send0/sdk";
import { Mail, SearchX } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageBody, PageHeader, PageToolbar } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useListNavigation } from "@/lib/use-list-navigation";
import { useMessages } from "../api/use-messages";
import { MessageFilters } from "../components/message-filters";
import { MessageSheet } from "../components/message-sheet";
import { MessagesList } from "../components/messages-list";
import { useApiFilters, useMessageFilters, useOpenMessage, type MessageFilters as Filters } from "../use-message-filters";

/** Every message across the workspace's inboxes: filterable, keyboard-navigable, with a detail view. */
export default function MessagesPage() {
  const { filters, setFilter, clear, active } = useMessageFilters();
  const messages = useMessages(useApiFilters(filters));
  const [openId, setOpenId] = useOpenMessage();
  const inboxes = useInboxes();
  const nameOf = useMemo(() => {
    const map = new Map(inboxes.items.map((i) => [i.id, i.display_name || i.local_part]));
    return (id: string) => map.get(id);
  }, [inboxes.items]);

  useListNavigation({ ids: messages.items.map((m) => m.id), current: openId, onMove: setOpenId, onEscape: () => setOpenId(null), enabled: !openId });
  useHotkeys({ "/": () => document.getElementById("message-search")?.focus() });

  return (
    <Page>
      <PageHeader>
        <Tabs value={filters.direction || "all"} onValueChange={(v) => setFilter("direction", v === "all" ? "" : (v as Filters["direction"]))}>
          <TabsList aria-label="Direction">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="in">Received</TabsTrigger>
            <TabsTrigger value="out">Sent</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>
      <PageToolbar>
        <MessageFilters filters={filters} onChange={setFilter} onClear={clear} active={active} />
      </PageToolbar>
      <PageBody>
        <QueryState
          query={messages.state}
          skeleton={<ListSkeleton rows={10} />}
          isEmpty={(items) => items.length === 0}
          empty={
            active ? (
              <EmptyState icon={SearchX} title="No messages match" description="Try a different search or fewer filters." action={<Button onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={Mail} title="No messages yet" description="Everything your inboxes send and receive shows up here, grouped by day." />
            )
          }
        >
          {(items) => (
            <>
              <MessagesList messages={items} selectedId={openId} onOpen={(m: Message) => setOpenId(m.id)} inboxName={nameOf} />
              <LoadMore hasNextPage={messages.hasNextPage} isFetchingNextPage={messages.isFetchingNextPage} fetchNextPage={() => void messages.fetchNextPage()} />
            </>
          )}
        </QueryState>
      </PageBody>
      <MessageSheet messageId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </Page>
  );
}
