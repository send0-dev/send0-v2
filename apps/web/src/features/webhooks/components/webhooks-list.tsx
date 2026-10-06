import type { Webhook } from "@send0/sdk";
import { useNavigate } from "react-router";
import { List, ListRow } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-icon";
import { eventSummary } from "../event-summary";

export function WebhooksList({ webhooks }: { webhooks: Webhook[] }) {
  const navigate = useNavigate();
  return (
    <List>
      {webhooks.map((w) => {
        const url = new URL(w.url);
        return (
          <ListRow key={w.id} onClick={() => navigate(`/webhooks/${w.id}`)}>
            <StatusIcon status={w.status} />
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
              <span className="truncate font-medium">{url.host}</span>
              <span className="truncate font-mono text-xs text-faint">{url.pathname}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">{eventSummary(w.events)}</span>
            <RelativeTime iso={w.created_at} className="w-20 shrink-0 text-right text-xs text-faint max-sm:hidden" />
          </ListRow>
        );
      })}
    </List>
  );
}
