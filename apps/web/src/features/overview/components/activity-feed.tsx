import type { Message } from "@send0/sdk";
import { Activity } from "lucide-react";
import { Link } from "react-router";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useMessages } from "@/features/messages/api/use-messages";
import { mailboxShort } from "@/features/messages/components/mailbox";

function Sentence({ m, inbox }: { m: Message; inbox: string }) {
  const who = m.direction === "in" ? mailboxShort(m.from) : inbox;
  const verb = m.direction === "in" ? `emailed ${inbox}` : m.status === "bounced" || m.status === "complained" ? `bounced at ${m.to[0]?.email}` : `sent to ${m.to[0]?.email ?? "…"}`;
  return (
    <span className="min-w-0 truncate">
      <span className="font-medium text-foreground">{who}</span> <span className="text-muted-foreground">{verb}</span>
    </span>
  );
}

/** The latest mail across the workspace, as a readable timeline. */
export function ActivityFeed() {
  const messages = useMessages({ limit: 10 });
  const inboxes = useInboxes();
  const local = (id: string) => inboxes.items.find((i) => i.id === id)?.local_part ?? "an inbox";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <Link to="/messages" className="text-xs text-muted-foreground hover:text-foreground">
          All messages →
        </Link>
      </CardHeader>
      <QueryState
        query={{ ...messages.state, data: messages.state.data?.slice(0, 10) }}
        skeleton={
          <div className="grid gap-3 px-4 pb-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        }
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState icon={Activity} title="Nothing yet" description="Mail your inboxes send and receive appears here as it happens." className="py-10" />}
      >
        {(items) => (
          <ol className="relative px-4 pb-3">
            <span aria-hidden className="absolute top-2 bottom-5 left-[27px] w-px bg-border" />
            {items.map((m) => (
              <li key={m.id}>
                <Link to={`/messages?message=${m.id}`} className="relative flex items-center gap-3 rounded-md px-1.5 py-2 text-[13px] transition-colors hover:bg-hover">
                  <span className="relative z-10 rounded-full ring-4 ring-card">
                    <Avatar name={m.direction === "in" ? (m.from?.name || m.from?.email || "?") : local(m.inbox_id)} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Sentence m={m} inbox={local(m.inbox_id)} />
                    <span className="truncate text-xs text-faint">{m.subject || "(no subject)"}</span>
                  </span>
                  <StatusIcon status={m.status} />
                  <RelativeTime iso={m.created_at} className="w-16 shrink-0 text-right text-xs text-faint" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </Card>
  );
}
