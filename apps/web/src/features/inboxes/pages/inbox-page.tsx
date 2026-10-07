import { Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { CopyButton } from "@/components/copy-button";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { DetailPane, ListPane, PaneBar, SplitView } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { pluralize } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useListNavigation } from "@/lib/use-list-navigation";
import { useInbox } from "../api/use-inbox";
import { useInboxLiveUpdates } from "../api/use-inbox-live-updates";
import { useThreads } from "../api/use-threads";
import { InboxEmpty } from "../components/inbox-empty";
import { InboxSettingsSheet } from "../components/inbox-settings-sheet";
import { NoThread } from "../components/no-thread";
import { PolicyBadge } from "../components/policy-badge";
import { ThreadBar } from "../components/thread-bar";
import { ThreadComposer } from "../components/thread-composer";
import { ThreadList } from "../components/thread-list";
import { ThreadView } from "../components/thread-view";

function ListSkeleton() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-border/60 px-gutter py-3.5">
          <Skeleton className="size-7 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One inbox as a mail client: threads on the left, the open conversation on the right. Updates live. */
export default function InboxPage() {
  const { inboxId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const threadId = params.get("thread");
  const inbox = useInbox(inboxId);
  const threads = useThreads(inboxId);
  const canManage = useCan("inbox.manage");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  useInboxLiveUpdates(inboxId);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return threads.items;
    return threads.items.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.participants.some((p) => p.toLowerCase().includes(q)) ||
        t.latest_message?.snippet.toLowerCase().includes(q),
    );
  }, [threads.items, filter]);

  const ids = visible.map((t) => t.id);
  const index = threadId ? ids.indexOf(threadId) : -1;
  const select = (id: string | null) => setParams(id ? { thread: id } : {}, { replace: !!threadId });
  useListNavigation({ ids, current: threadId, onMove: select, onEscape: () => select(null) });
  useHotkeys({ r: () => document.getElementById("reply-composer")?.focus(), "/": () => document.getElementById("thread-filter")?.focus() });

  const ibx = inbox.data;
  return (
    <Page>
      <PageHeader
        actions={
          ibx && (
            <>
              <span className="max-sm:hidden">
                <PolicyBadge policy={ibx.send_policy} />
              </span>
              <CopyButton value={ibx.address} label="Copy address" />
              {canManage && (
                <Tooltip content="Inbox settings">
                  <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="Inbox settings">
                    <Settings2 />
                  </Button>
                </Tooltip>
              )}
            </>
          )
        }
      />
      <QueryState query={inbox} skeleton={<ListSkeleton />}>
        {(ibx) => (
          <SplitView detailOpen={!!threadId}>
            <ListPane
              label="Threads"
              bar={
                <PaneBar className="gap-0">
                  <Search className="size-3.5 shrink-0 text-faint" />
                  <input
                    id="thread-filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (setFilter(""), e.currentTarget.blur())}
                    placeholder="Filter threads"
                    aria-label="Filter threads"
                    className="h-full min-w-0 flex-1 bg-transparent pl-2 text-[13px] text-foreground outline-none placeholder:text-faint"
                  />
                  {threads.isSuccess && <span className="tabular shrink-0">{pluralize(visible.length, "thread")}</span>}
                </PaneBar>
              }
            >
              <QueryState
                query={threads.state}
                skeleton={<ListSkeleton />}
                isEmpty={(items) => items.length === 0}
                empty={<InboxEmpty inbox={ibx} />}
              >
                {() => (
                  <>
                    <ThreadList
                      threads={visible}
                      selectedId={threadId}
                      onSelect={select}
                      inboxAddress={ibx.address}
                      inboxName={ibx.display_name || ibx.local_part}
                    />
                    {filter && !visible.length && (
                      <p className="px-gutter py-8 text-center text-[13px] text-faint">No threads match “{filter}”.</p>
                    )}
                    <LoadMore
                      hasNextPage={threads.hasNextPage}
                      isFetchingNextPage={threads.isFetchingNextPage}
                      fetchNextPage={() => void threads.fetchNextPage()}
                    />
                  </>
                )}
              </QueryState>
            </ListPane>
            <DetailPane
              label="Conversation"
              bar={
                threadId && (
                  <ThreadBar
                    threadId={threadId}
                    index={index}
                    total={ids.length}
                    onPrev={index > 0 ? () => select(ids[index - 1]!) : undefined}
                    onNext={index >= 0 && index < ids.length - 1 ? () => select(ids[index + 1]!) : undefined}
                    onBack={() => select(null)}
                  />
                )
              }
              footer={threadId && <ThreadComposer inbox={ibx} threadId={threadId} />}
            >
              {threadId ? <ThreadView inbox={ibx} threadId={threadId} /> : <NoThread />}
            </DetailPane>
            <InboxSettingsSheet inbox={ibx} open={settingsOpen} onOpenChange={setSettingsOpen} />
          </SplitView>
        )}
      </QueryState>
    </Page>
  );
}
