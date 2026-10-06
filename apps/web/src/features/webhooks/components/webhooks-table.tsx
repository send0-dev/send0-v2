import type { Webhook } from "@send0/sdk";
import { useNavigate } from "react-router";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { eventSummary } from "../event-summary";

export function WebhooksTable({ webhooks }: { webhooks: Webhook[] }) {
  const navigate = useNavigate();
  const columns: Column<Webhook>[] = [
    { key: "url", header: "Endpoint", cell: (w) => <span className="block max-w-md truncate font-mono text-[12.5px]">{w.url}</span> },
    { key: "events", header: "Events", hideBelow: "md", cell: (w) => <span className="text-muted-foreground">{eventSummary(w.events)}</span> },
    { key: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
    { key: "created", header: "Created", hideBelow: "sm", className: "text-right", cell: (w) => <RelativeTime iso={w.created_at} className="text-muted-foreground" /> },
  ];
  return <DataTable columns={columns} rows={webhooks} rowKey={(w) => w.id} onRowClick={(w) => navigate(`/webhooks/${w.id}`)} />;
}
