import type { Message } from "@send0/sdk";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { AttachmentList } from "./attachment-list";
import { AuthBadges } from "./auth-badges";
import { ExtractedDetails } from "./extracted-details";
import { MailboxList, mailboxLabel } from "./mailbox";
import { SafetyAlert } from "./safety-alert";

/** One email in a thread: who, when, status, safety, what send0 extracted, the body and attachments. */
export function MessageCard({ message, className }: { message: Message; className?: string }) {
  const outgoing = message.direction === "out";
  return (
    <article className={cn("rounded-lg border bg-card", outgoing && "border-dashed", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{outgoing ? "You" : mailboxLabel(message.from)}</p>
          <MailboxList label="to" list={message.to} />
          <MailboxList label="cc" list={message.cc} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {message.status !== "received" && <StatusBadge status={message.status} />}
          <RelativeTime iso={message.received_at ?? message.sent_at ?? message.created_at} className="text-xs text-muted-foreground" />
        </div>
      </header>
      <div className="grid gap-3 px-4 py-3.5">
        <SafetyAlert safety={message.safety} />
        {(message.auth || message.extracted?.otp || message.extracted?.action_link) && (
          <div className="flex flex-wrap items-center gap-2">
            <ExtractedDetails extracted={message.extracted} />
            <AuthBadges auth={message.auth} />
          </div>
        )}
        <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">{message.extracted_text ?? message.text ?? <span className="text-muted-foreground italic">No text body</span>}</div>
        <AttachmentList messageId={message.id} attachments={message.attachments} />
      </div>
    </article>
  );
}
