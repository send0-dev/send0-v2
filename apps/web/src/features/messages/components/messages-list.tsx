import type { Message } from "@send0/sdk";
import { Fragment } from "react";
import { Avatar, InboxDot } from "@/components/avatar";
import { List, ListGroupHeader, ListRow } from "@/components/list";
import { StatusIcon } from "@/components/status-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { groupByDay } from "@/lib/group-by-day";
import { mailboxShort } from "./mailbox";

const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

/** Every message, grouped by day: who, what, which inbox, delivery status, when. */
export function MessagesList({ messages, selectedId, onOpen, inboxName }: { messages: Message[]; selectedId: string | null; onOpen: (m: Message) => void; inboxName: (id: string) => string | undefined }) {
  return (
    <List>
      {groupByDay(messages, (m) => m.created_at).map((g) => (
        <Fragment key={g.label}>
          <ListGroupHeader label={g.label} count={g.items.length} />
          {g.items.map((m) => {
            const who = m.direction === "in" ? mailboxShort(m.from) : m.to.map((t) => t.email).join(", ");
            return (
              <ListRow key={m.id} data-nav-id={m.id} selected={m.id === selectedId} onClick={() => onOpen(m)}>
                <Tooltip content={m.status}>
                  <span>
                    <StatusIcon status={m.status} />
                  </span>
                </Tooltip>
                <Avatar name={m.direction === "in" ? who : (inboxName(m.inbox_id) ?? "you")} size="sm" />
                <span className="w-40 shrink-0 truncate font-medium max-sm:w-28">
                  {m.direction === "out" && <span className="font-normal text-faint">To </span>}
                  {who}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 truncate max-w-[50%]">{m.subject || "(no subject)"}</span>
                  <span className="truncate text-faint max-md:hidden">{(m.extracted_text ?? m.text ?? "").replace(/\s+/g, " ").slice(0, 160)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground max-lg:hidden">
                  <InboxDot id={m.inbox_id} />
                  {inboxName(m.inbox_id) ?? "inbox"}
                </span>
                <span className="tabular w-16 shrink-0 text-right text-xs text-faint">{time.format(new Date(m.created_at))}</span>
              </ListRow>
            );
          })}
        </Fragment>
      ))}
    </List>
  );
}
