import type { Inbox } from "@send0/sdk";
import { useNavigate } from "react-router";
import { CopyButton } from "@/components/copy-button";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { PolicyBadge } from "./policy-badge";

export function InboxesTable({ inboxes }: { inboxes: Inbox[] }) {
  const navigate = useNavigate();
  const columns: Column<Inbox>[] = [
    {
      key: "address",
      header: "Address",
      cell: (i) => (
        <div className="flex items-center gap-1">
          <div className="grid min-w-0">
            <span className="truncate font-mono text-[12.5px] font-medium">{i.address}</span>
            {i.display_name && <span className="truncate text-xs text-muted-foreground">{i.display_name}</span>}
          </div>
          <span onClick={(e) => e.stopPropagation()}>
            <CopyButton value={i.address} label="Copy address" />
          </span>
        </div>
      ),
    },
    { key: "policy", header: "Sending", cell: (i) => <PolicyBadge policy={i.send_policy} /> },
    { key: "created", header: "Created", hideBelow: "sm", className: "text-right", cell: (i) => <RelativeTime iso={i.created_at} className="text-muted-foreground" /> },
  ];
  return <DataTable columns={columns} rows={inboxes} rowKey={(i) => i.id} onRowClick={(i) => navigate(`/inboxes/${i.id}`)} />;
}
