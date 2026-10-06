import type { Inbox } from "@send0/sdk";
import { Mail } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CopyButton } from "@/components/copy-button";
import { QueryState } from "@/components/query-state";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageItem } from "@/features/messages/components/message-item";
import { useCan } from "@/lib/permissions";
import { useThread } from "../api/use-thread";
import { ReplyForm } from "../forms/reply-form";

function ThreadSkeleton() {
  return (
    <div className="grid gap-3 p-6" aria-busy="true">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-4 h-48 w-full rounded-xl" />
    </div>
  );
}

/** Nothing open yet: say how to get around. */
function NoThread() {
  return (
    <div className="dots flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border-strong bg-elevated shadow-elevated">
        <Mail className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[14px] font-medium">No conversation open</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Pick a thread, or move through them from the keyboard.</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>R</Kbd> reply
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </div>
  );
}

/** The open conversation: subject and people, every message (older ones folded), and the reply box. */
export function ThreadView({ inbox, threadId }: { inbox: Inbox; threadId: string | null }) {
  const thread = useThread(inbox.id, threadId);
  const canSend = useCan("mail.send");
  if (!threadId) return <NoThread />;
  return (
    <QueryState query={thread} skeleton={<ThreadSkeleton />}>
      {(t) => {
        const last = t.messages.at(-1);
        const people = t.participants.filter((p) => p.toLowerCase() !== inbox.address.toLowerCase());
        return (
          <div className="flex min-h-full flex-col">
            <div className="flex-1 px-4 pt-6 pb-4 md:px-8">
              <div className="mb-5 animate-enter">
                <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.015em] text-balance">{t.subject || "(no subject)"}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {people.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5">
                      <Avatar name={p} size="xs" />
                      {p}
                    </span>
                  ))}
                  <span className="text-faint">· {t.message_count === 1 ? "1 message" : `${t.message_count} messages`}</span>
                  <CopyButton value={t.id} label="Copy thread id" variant="ghost" size="icon-xs" />
                </div>
              </div>
              <div className="grid gap-2">
                {t.messages.map((m, i) => (
                  <MessageItem key={m.id} message={m} inboxName={inbox.display_name || inbox.local_part} defaultOpen={i === t.messages.length - 1 || t.messages.length <= 2} />
                ))}
              </div>
            </div>
            {last && canSend && (
              <div className="sticky bottom-0 bg-gradient-to-t from-panel via-panel to-panel/0 px-4 pt-6 pb-4 md:px-8">
                <ReplyForm key={t.id} inboxId={inbox.id} threadId={t.id} replyTo={last} needsApproval={inbox.send_policy === "approval"} />
              </div>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
