import type { Message } from "@send0/sdk";
import { ArrowDownLeft } from "lucide-react";
import { Fragment } from "react";
import { Avatar, InboxDot } from "@/components/avatar";
import { List, ListGroupHeader, ListRow } from "@/components/list";
import { StatusIcon } from "@/components/status-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { groupByDay } from "@/lib/group-by-day";
import { mailboxShort } from "../mailbox-names";

const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** Received mail gets a quiet arrow; sent mail shows where its delivery stands. */
function Mark({ m }: { m: Message }) {
  if (m.direction === "in") {
    return (
      <Tooltip content="Received">
        <ArrowDownLeft className="size-3.5 shrink-0 text-faint" aria-label="Received" />
      </Tooltip>
    );
  }
  return (
    <Tooltip content={`Sent · ${m.status}`}>
      <span aria-label={m.status}>
        <StatusIcon status={m.status} />
      </span>
    </Tooltip>
  );
}

/**
 * Every message, grouped by day. Desktop: one line per message (who, subject + preview, inbox,
 * time). Phones: two lines (who + time, then subject + preview).
 */
export function MessagesList({ messages, selectedId, onOpen, inboxName }: { messages: Message[]; selectedId: string | null; onOpen: (m: Message) => void; inboxName: (id: string) => string | undefined }) {
  return (
    <List>
      {groupByDay(messages, (m) => m.created_at).map((g) => (
        <Fragment key={g.label}>
          <ListGroupHeader label={g.label} count={g.items.length} />
          {g.items.map((m) => {
            const outgoing = m.direction === "out";
            const who = outgoing ? m.to.map((t) => t.email).join(", ") : mailboxShort(m.from);
            const at = time.format(new Date(m.created_at));
            const preview = (m.extracted_text ?? m.text ?? "").replace(/\s+/g, " ").slice(0, 160);
            return (
              <ListRow key={m.id} data-nav-id={m.id} selected={m.id === selectedId} onClick={() => onOpen(m)} className="items-start gap-3 py-2.5 md:items-center md:py-0">
                <span className="mt-1 flex w-3.5 justify-center md:mt-0">
                  <Mark m={m} />
                </span>
                <Avatar name={outgoing ? (inboxName(m.inbox_id) ?? "you") : who} size="sm" className="md:mt-0" />
                <span className="grid min-w-0 flex-1 gap-0.5 md:flex md:items-center md:gap-3">
                  <span className="flex min-w-0 items-center gap-2 md:w-44 md:shrink-0">
                    <span className="truncate font-medium">
                      {outgoing && <span className="font-normal text-faint">To </span>}
                      {who}
                    </span>
                    <span className="tabular ml-auto shrink-0 text-xs text-faint md:hidden">{at}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate md:max-w-[55%] md:shrink-0">{m.subject || "(no subject)"}</span>
                    <span className="truncate text-faint max-md:hidden">{preview}</span>
                  </span>
                  <span className="truncate text-xs text-faint md:hidden">{preview}</span>
                </span>
                <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground max-lg:hidden">
                  <InboxDot id={m.inbox_id} />
                  <span className="truncate">{inboxName(m.inbox_id) ?? "inbox"}</span>
                </span>
                <span className="tabular w-16 shrink-0 text-right text-xs text-faint max-md:hidden">{at}</span>
              </ListRow>
            );
          })}
        </Fragment>
      ))}
    </List>
  );
}
