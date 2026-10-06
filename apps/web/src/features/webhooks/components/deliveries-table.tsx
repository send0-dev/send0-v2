import type { Delivery } from "@send0/sdk";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { errorMessage } from "@/lib/api";
import { useRetryDelivery } from "../api/use-webhook-mutations";

/** Every attempt to deliver an event to the endpoint, with the response, and replay. */
export function DeliveriesTable({ webhookId, deliveries }: { webhookId: string; deliveries: Delivery[] }) {
  const retry = useRetryDelivery(webhookId);
  const columns: Column<Delivery>[] = [
    { key: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
    {
      key: "event",
      header: "Event",
      cell: (d) => (
        <div className="grid">
          <span className="font-mono text-xs">{d.event_type ?? "event"}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{d.event_id}</span>
        </div>
      ),
    },
    {
      key: "response",
      header: "Response",
      hideBelow: "md",
      cell: (d) =>
        d.last_error && !d.last_status_code ? (
          <Tooltip content={d.last_error}>
            <span className="block max-w-56 truncate text-xs text-destructive">{d.last_error}</span>
          </Tooltip>
        ) : (
          <span className="tabular font-mono text-xs">
            {d.last_status_code ?? "—"}
            {d.last_duration_ms != null && <span className="text-muted-foreground"> · {d.last_duration_ms} ms</span>}
          </span>
        ),
    },
    { key: "attempts", header: "Attempts", hideBelow: "sm", className: "tabular text-center", cell: (d) => d.attempts },
    { key: "when", header: "Last attempt", hideBelow: "sm", cell: (d) => <RelativeTime iso={d.updated_at} className="text-xs text-muted-foreground" /> },
    {
      key: "retry",
      header: <span className="sr-only">Replay</span>,
      className: "w-24 text-right",
      cell: (d) => (
        <Button
          variant="ghost"
          size="sm"
          loading={retry.isPending && retry.variables === d.id}
          onClick={() => retry.mutate(d.id, { onSuccess: () => toast.success("Delivery queued again"), onError: (e) => toast.error(errorMessage(e)) })}
        >
          <RotateCw />
          Replay
        </Button>
      ),
    },
  ];
  return <DataTable columns={columns} rows={deliveries} rowKey={(d) => d.id} />;
}
