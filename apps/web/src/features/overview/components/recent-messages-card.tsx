import { ArrowDownLeft, ArrowUpRight, Mail } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { QueryState } from "@/components/query-state";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMessages } from "@/features/messages/api/use-messages";
import { mailboxShort } from "@/features/messages/components/mailbox";

export function RecentMessagesCard() {
  const messages = useMessages({ limit: 8 });
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>Recent messages</CardTitle>
        <Link to="/messages" className="text-[13px] text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </CardHeader>
      <QueryState
        query={{ ...messages.state, data: messages.state.data?.slice(0, 8) }}
        skeleton={
          <div className="grid gap-3 px-5 pb-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        }
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState icon={Mail} title="No mail yet" description="Messages your inboxes send and receive will show up here." className="py-10" />}
      >
        {(items) => (
          <ul className="divide-y border-t">
            {items.map((m) => (
              <li key={m.id}>
                <Link to={`/messages?message=${m.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50">
                  {m.direction === "in" ? <ArrowDownLeft className="size-4 shrink-0 text-muted-foreground" /> : <ArrowUpRight className="size-4 shrink-0 text-info" />}
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-[13px] font-medium">{m.subject || "(no subject)"}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.direction === "in" ? mailboxShort(m.from) : m.to.map((t) => t.email).join(", ")}</span>
                  </span>
                  {m.status !== "received" && <StatusBadge status={m.status} className="max-sm:hidden" />}
                  <RelativeTime iso={m.created_at} className="shrink-0 text-xs text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
