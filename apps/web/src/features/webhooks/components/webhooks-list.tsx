import type { Webhook } from "@send0/sdk";
import { useNavigate } from "react-router";
import { List, ListColumns, ListRow } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { eventSummary } from "../event-summary";

const COL = {
  url: "min-w-0 flex-1",
  events: "w-36 shrink-0 max-md:hidden",
  status: "w-24 shrink-0",
  created: "w-20 shrink-0 text-right max-sm:hidden",
};

export function WebhooksList({ webhooks }: { webhooks: Webhook[] }) {
  const navigate = useNavigate();
  return (
    <>
      <ListColumns>
        <span className={COL.url}>Endpoint</span>
        <span className={COL.events}>Events</span>
        <span className={COL.status}>Status</span>
        <span className={COL.created}>Created</span>
      </ListColumns>
      <List>
        {webhooks.map((w) => {
          const url = new URL(w.url);
          return (
            <ListRow key={w.id} onClick={() => navigate(`/webhooks/${w.id}`)}>
              <span className={`${COL.url} flex items-baseline gap-1`}>
                <span className="truncate font-medium">{url.host}</span>
                <span className="truncate font-mono text-xs text-faint">{url.pathname}</span>
              </span>
              <span className={`${COL.events} truncate text-xs text-muted-foreground`}>{eventSummary(w.events)}</span>
              <span className={COL.status}>
                <StatusBadge status={w.status} />
              </span>
              <RelativeTime iso={w.created_at} className={`${COL.created} text-xs text-faint`} />
            </ListRow>
          );
        })}
      </List>
    </>
  );
}
