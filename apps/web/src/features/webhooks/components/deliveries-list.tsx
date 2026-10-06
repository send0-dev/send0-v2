import type { Delivery } from "@send0/sdk";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { List, ListColumns, ListRow } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRetryDelivery } from "../api/use-webhook-mutations";

const COL = {
  event: "w-40 shrink-0",
  id: "min-w-0 flex-1 max-md:hidden",
  response: "w-28 shrink-0 text-right",
  attempts: "w-16 shrink-0 text-right max-sm:hidden",
  when: "w-20 shrink-0 text-right max-sm:hidden",
  replay: "w-20 shrink-0 text-right",
};

function Response({ d }: { d: Delivery }) {
  if (d.last_error && !d.last_status_code) {
    return (
      <Tooltip content={d.last_error}>
        <span className="truncate text-destructive">Error</span>
      </Tooltip>
    );
  }
  if (!d.last_status_code) return <span className="text-faint">Not sent yet</span>;
  return (
    <span className="tabular">
      <span className={cn("font-mono", d.last_status_code < 300 ? "text-success" : "text-destructive")}>{d.last_status_code}</span>
      {d.last_duration_ms != null && <span className="text-faint"> · {d.last_duration_ms}ms</span>}
    </span>
  );
}

/** Every attempt to deliver an event: outcome, response, attempts, and replay. */
export function DeliveriesList({ webhookId, deliveries }: { webhookId: string; deliveries: Delivery[] }) {
  const retry = useRetryDelivery(webhookId);
  return (
    <>
      <ListColumns>
        <span className="w-3.5 shrink-0" />
        <span className={COL.event}>Event</span>
        <span className={COL.id}>Event ID</span>
        <span className={COL.response}>Response</span>
        <span className={COL.attempts}>Attempts</span>
        <span className={COL.when}>Last try</span>
        <span className={COL.replay} />
      </ListColumns>
      <List>
        {deliveries.map((d) => (
          <ListRow key={d.id}>
            <StatusIcon status={d.status} />
            <span className={`${COL.event} truncate font-mono text-xs`}>{d.event_type ?? "event"}</span>
            <span className={`${COL.id} truncate font-mono text-[11px] text-faint`}>{d.event_id}</span>
            <span className={`${COL.response} text-xs`}>
              <Response d={d} />
            </span>
            <span className={`${COL.attempts} tabular text-xs text-muted-foreground`}>{d.attempts}</span>
            <RelativeTime iso={d.updated_at} className={`${COL.when} text-xs text-faint`} />
            <span className={COL.replay}>
              <Button
                variant="ghost"
                size="xs"
                loading={retry.isPending && retry.variables === d.id}
                onClick={() => retry.mutate(d.id, { onSuccess: () => toast.success("Queued for redelivery"), onError: (e) => toast.error(errorMessage(e)) })}
              >
                <RotateCw />
                Replay
              </Button>
            </span>
          </ListRow>
        ))}
      </List>
    </>
  );
}
