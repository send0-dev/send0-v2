import type { Delivery } from "@send0/sdk";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { List, ListRow, RowActions } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRetryDelivery } from "../api/use-webhook-mutations";

/** Every attempt to deliver an event: outcome, response, timing, and replay on hover. */
export function DeliveriesList({ webhookId, deliveries }: { webhookId: string; deliveries: Delivery[] }) {
  const retry = useRetryDelivery(webhookId);
  return (
    <List>
      {deliveries.map((d) => {
        const code = d.last_status_code;
        return (
          <ListRow key={d.id}>
            <StatusIcon status={d.status} />
            <span className="w-40 shrink-0 truncate font-mono text-xs">{d.event_type ?? "event"}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-faint max-md:hidden">{d.event_id}</span>
            {d.last_error && !code ? (
              <Tooltip content={d.last_error}>
                <span className="max-w-48 shrink-0 truncate text-xs text-destructive">{d.last_error}</span>
              </Tooltip>
            ) : (
              <span className={cn("tabular w-12 shrink-0 text-right font-mono text-xs", code && code < 300 ? "text-success" : code ? "text-destructive" : "text-faint")}>{code ?? "—"}</span>
            )}
            <span className="tabular w-16 shrink-0 text-right text-xs text-faint max-sm:hidden">{d.last_duration_ms != null ? `${d.last_duration_ms} ms` : ""}</span>
            <span className="tabular w-10 shrink-0 text-right text-xs text-faint max-sm:hidden" title="Attempts">
              ×{d.attempts}
            </span>
            <RelativeTime iso={d.updated_at} className="w-20 shrink-0 text-right text-xs text-faint" />
            <RowActions>
              <Button
                variant="ghost"
                size="xs"
                loading={retry.isPending && retry.variables === d.id}
                onClick={() => retry.mutate(d.id, { onSuccess: () => toast.success("Queued for redelivery"), onError: (e) => toast.error(errorMessage(e)) })}
              >
                <RotateCw />
                Replay
              </Button>
            </RowActions>
          </ListRow>
        );
      })}
    </List>
  );
}
