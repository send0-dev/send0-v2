import { Search, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { InboxDot } from "@/components/avatar";
import { CopyButton } from "@/components/copy-button";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";
import { useListNavigation } from "@/lib/use-list-navigation";
import { cn } from "@/lib/utils";
import { useInbox } from "../api/use-inbox";
import { useInboxLiveUpdates } from "../api/use-inbox-live-updates";
import { useThreads } from "../api/use-threads";
import { InboxEmpty } from "../components/inbox-empty";
import { InboxSettingsSheet } from "../components/inbox-settings-sheet";
import { PolicyBadge } from "../components/policy-badge";
import { ThreadList } from "../components/thread-list";
import { ThreadView } from "../components/thread-view";

function ListSkeleton() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-border/60 px-4 py-3.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
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
    return q ? threads.items.filter((t) => t.subject.toLowerCase().includes(q) || t.participants.some((p) => p.toLowerCase().includes(q))) : threads.items;
  }, [threads.items, filter]);

  const select = (id: string | null) => setParams(id ? { thread: id } : {}, { replace: !!threadId });
  useListNavigation({ ids: visible.map((t) => t.id), current: threadId, onMove: select, onEscape: () => select(null) });
  useHotkeys({ r: () => document.getElementById("reply-composer")?.focus(), "/": () => document.getElementById("thread-filter")?.focus() });

  const ibx = inbox.data;
  return (
    <Page>
      <PageHeader
        actions={
          ibx && (
            <>
              <PolicyBadge policy={ibx.send_policy} />
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
          <div className="flex min-h-0 flex-1">
            <section aria-label="Threads" className={cn("flex w-full min-w-0 flex-col border-r md:w-[340px] md:shrink-0", threadId && "max-md:hidden")}>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
                <InboxDot id={ibx.id} />
                <span className="truncate font-mono text-xs text-muted-foreground">{ibx.address}</span>
              </div>
              <div className="relative shrink-0 border-b px-3 py-2">
                <Search className="pointer-events-none absolute top-1/2 left-5.5 size-3.5 -translate-y-1/2 text-faint" />
                <input
                  id="thread-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (setFilter(""), e.currentTarget.blur())}
                  placeholder="Filter threads"
                  aria-label="Filter threads"
                  className="h-7 w-full rounded-md bg-transparent pr-2 pl-7 text-[13px] outline-none placeholder:text-faint focus:bg-hover"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <QueryState
                  query={threads.state}
                  skeleton={<ListSkeleton />}
                  isEmpty={(items) => items.length === 0}
                  empty={<InboxEmpty inbox={ibx} />}
                >
                  {() => (
                    <>
                      <ThreadList threads={visible} selectedId={threadId} onSelect={select} inboxAddress={ibx.address} />
                      {filter && !visible.length && <p className="px-4 py-8 text-center text-[13px] text-faint">No threads match “{filter}”.</p>}
                      <LoadMore hasNextPage={threads.hasNextPage} isFetchingNextPage={threads.isFetchingNextPage} fetchNextPage={() => void threads.fetchNextPage()} />
                    </>
                  )}
                </QueryState>
              </div>
            </section>
            <section aria-label="Conversation" className={cn("min-w-0 flex-1 overflow-y-auto", !threadId && "max-md:hidden")}>
              {threadId && (
                <button type="button" className="m-3 cursor-pointer text-[13px] text-muted-foreground hover:text-foreground md:hidden" onClick={() => select(null)}>
                  ← All threads
                </button>
              )}
              <ThreadView inbox={ibx} threadId={threadId} />
            </section>
            <InboxSettingsSheet inbox={ibx} open={settingsOpen} onOpenChange={setSettingsOpen} />
          </div>
        )}
      </QueryState>
    </Page>
  );
}
