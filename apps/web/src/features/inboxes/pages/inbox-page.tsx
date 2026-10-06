import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { LoadMore } from "@/components/load-more";
import { QueryState } from "@/components/query-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useInbox } from "../api/use-inbox";
import { useInboxLiveUpdates } from "../api/use-inbox-live-updates";
import { useThreads } from "../api/use-threads";
import { InboxEmpty } from "../components/inbox-empty";
import { InboxHeader } from "../components/inbox-header";
import { InboxSettingsSheet } from "../components/inbox-settings-sheet";
import { ThreadList } from "../components/thread-list";
import { ThreadView } from "../components/thread-view";

function ListSkeleton() {
  return (
    <div className="divide-y" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid gap-2 px-4 py-3.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** One inbox as a mail client: threads on the left, the open thread on the right. Updates live. */
export default function InboxPage() {
  const { inboxId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const threadId = params.get("thread");
  const inbox = useInbox(inboxId);
  const threads = useThreads(inboxId);
  const canManage = useCan("inbox.manage");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useInboxLiveUpdates(inboxId);

  const select = (id: string | null) => setParams(id ? { thread: id } : {}, { replace: !!threadId });

  return (
    <QueryState query={inbox} skeleton={<Skeleton className="h-10 w-80" />}>
      {(ibx) => (
        <>
          <InboxHeader inbox={ibx} onOpenSettings={canManage ? () => setSettingsOpen(true) : undefined} />
          <QueryState
            query={threads.state}
            skeleton={
              <Card>
                <ListSkeleton />
              </Card>
            }
            isEmpty={(items) => items.length === 0}
            empty={
              <Card>
                <InboxEmpty inbox={ibx} />
              </Card>
            }
          >
            {(items) => (
              <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                <Card className={cn("overflow-hidden lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto", threadId && "max-lg:hidden")}>
                  <ThreadList threads={items} selectedId={threadId} onSelect={select} inboxAddress={ibx.address} />
                  <LoadMore hasNextPage={threads.hasNextPage} isFetchingNextPage={threads.isFetchingNextPage} fetchNextPage={() => void threads.fetchNextPage()} />
                </Card>
                <section className={cn("min-w-0", !threadId && "max-lg:hidden")}>
                  {threadId && (
                    <button type="button" className="mb-3 cursor-pointer text-[13px] text-muted-foreground hover:text-foreground lg:hidden" onClick={() => select(null)}>
                      ← All threads
                    </button>
                  )}
                  <ThreadView inbox={ibx} threadId={threadId} />
                </section>
              </div>
            )}
          </QueryState>
          <InboxSettingsSheet inbox={ibx} open={settingsOpen} onOpenChange={setSettingsOpen} />
        </>
      )}
    </QueryState>
  );
}
