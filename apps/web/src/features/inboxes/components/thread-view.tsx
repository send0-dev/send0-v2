import type { Inbox } from "@send0/sdk";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCard } from "@/features/messages/components/message-card";
import { useCan } from "@/lib/permissions";
import { useThread } from "../api/use-thread";
import { ReplyForm } from "../forms/reply-form";

function ThreadSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/** The selected conversation: subject, every message, and the reply box. */
export function ThreadView({ inbox, threadId }: { inbox: Inbox; threadId: string | null }) {
  const thread = useThread(inbox.id, threadId);
  const canSend = useCan("mail.send");
  if (!threadId) {
    return <EmptyState icon={MessagesSquare} title="Select a conversation" description="Replies are grouped into threads the way a mail client does." className="h-full" />;
  }
  return (
    <QueryState query={thread} skeleton={<ThreadSkeleton />}>
      {(t) => {
        const last = t.messages.at(-1);
        return (
          <div className="grid gap-3">
            <h2 className="text-base font-semibold tracking-tight">{t.subject || "(no subject)"}</h2>
            {t.messages.map((m) => (
              <MessageCard key={m.id} message={m} />
            ))}
            {last && canSend && <ReplyForm key={t.id} inboxId={inbox.id} threadId={t.id} replyTo={last} needsApproval={inbox.send_policy === "approval"} />}
          </div>
        );
      }}
    </QueryState>
  );
}
