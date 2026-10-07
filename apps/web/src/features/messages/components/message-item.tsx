import type { Message } from "@send0/sdk";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { AttachmentList } from "./attachment-list";
import { AuthBadges } from "./auth-badges";
import { ExtractedDetails } from "./extracted-details";
import { mailboxShort } from "../mailbox-names";
import { SafetyAlert } from "./safety-alert";

/**
 * One email in a thread, the way mail clients show it: collapsed to a one-line summary
 * (who, a snippet, when) unless it's open; open shows everything send0 knows about it.
 */
export function MessageItem({ message: m, inboxName, defaultOpen }: { message: Message; inboxName: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const outgoing = m.direction === "out";
  const who = outgoing ? inboxName || "You" : mailboxShort(m.from);
  const body = m.extracted_text ?? m.text;
  const when = m.received_at ?? m.sent_at ?? m.created_at;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-hover"
      >
        <Avatar name={who} size="md" />
        <span className="w-36 shrink-0 truncate text-[13px] font-medium">{who}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-faint">
          {m.expired ? "(content expired)" : body?.replace(/\s+/g, " ").slice(0, 200) || "(no text)"}
        </span>
        <RelativeTime iso={when} className="shrink-0 text-xs text-faint" />
      </button>
    );
  }

  return (
    <article className={cn("animate-enter rounded-xl border bg-card", outgoing && "bg-transparent")}>
      <header className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <Avatar name={who} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold">{who}</span>
            {!outgoing && m.from && <span className="truncate text-xs text-faint">{m.from.email}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            to {m.to.map((t) => t.email).join(", ") || "—"}
            {m.cc.length > 0 && <> · cc {m.cc.map((t) => t.email).join(", ")}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {m.status !== "received" && <StatusBadge status={m.status} />}
          <RelativeTime iso={when} className="text-xs text-faint" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded p-0.5 text-faint hover:bg-hover hover:text-foreground"
            aria-label="Collapse"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="grid gap-3 px-4 pb-4 pl-[60px]">
        <SafetyAlert safety={m.safety} />
        {(m.extracted?.otp || m.extracted?.action_link || m.auth) && (
          <div className="flex flex-wrap items-center gap-2">
            <ExtractedDetails extracted={m.extracted} />
            <AuthBadges auth={m.auth} />
          </div>
        )}
        <div className="text-[13.5px] leading-[1.65] break-words whitespace-pre-wrap text-foreground/90">
          {m.expired ? (
            <span className="text-faint italic">This message is past the inbox's retention period, so its content was deleted.</span>
          ) : (
            (body ?? <span className="text-faint italic">No text body</span>)
          )}
        </div>
        <AttachmentList messageId={m.id} attachments={m.attachments} />
      </div>
    </article>
  );
}
