import type { Inbox } from "@send0/sdk";
import { Avatar } from "@/components/avatar";
import { QueryState } from "@/components/query-state";
import { DetailContent } from "@/components/split-view";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageItem } from "@/features/messages/components/message-item";
import { useThread } from "../api/use-thread";

function ThreadSkeleton() {
  return (
    <DetailContent className="grid gap-3" aria-busy="true">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-4 h-48 w-full rounded-xl" />
    </DetailContent>
  );
}

/** The open conversation: subject and people, then every message (older ones folded). */
export function ThreadView({ inbox, threadId }: { inbox: Inbox; threadId: string }) {
  const thread = useThread(inbox.id, threadId);
  return (
    <QueryState query={thread} skeleton={<ThreadSkeleton />}>
      {(t) => {
        const people = t.participants.filter((p) => p.toLowerCase() !== inbox.address.toLowerCase());
        return (
          <DetailContent key={t.id} className="animate-enter">
            <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.015em] text-balance">{t.subject || "(no subject)"}</h2>
            {people.length > 0 && (
              <div className="mt-2.5 mb-6 flex flex-wrap items-center gap-1.5">
                {people.map((p) => (
                  <span
                    key={p}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border pr-2.5 pl-0.5 text-xs text-muted-foreground"
                  >
                    <Avatar name={p} size="sm" />
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="grid gap-2">
              {t.messages.map((m, i) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  inboxName={inbox.display_name || inbox.local_part}
                  defaultOpen={i === t.messages.length - 1 || t.messages.length <= 2}
                />
              ))}
            </div>
          </DetailContent>
        );
      }}
    </QueryState>
  );
}
