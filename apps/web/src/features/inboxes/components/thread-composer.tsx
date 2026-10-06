import type { Inbox } from "@send0/sdk";
import { useCan } from "@/lib/permissions";
import { useThread } from "../api/use-thread";
import { ReplyForm } from "../forms/reply-form";

/** The reply box pinned under the open thread, at the same width as the messages above it. */
export function ThreadComposer({ inbox, threadId }: { inbox: Inbox; threadId: string }) {
  const thread = useThread(inbox.id, threadId);
  const canSend = useCan("mail.send");
  const last = thread.data?.messages.at(-1);
  if (!canSend || !last) return null;
  return (
    <div className="w-full max-w-[760px] shrink-0 px-gutter pt-2 pb-4">
      <ReplyForm key={threadId} inboxId={inbox.id} threadId={threadId} replyTo={last} needsApproval={inbox.send_policy === "approval"} />
    </div>
  );
}
