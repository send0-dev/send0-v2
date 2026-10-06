import type { ApiKey } from "@send0/sdk";
import { MoreHorizontal } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pluralize } from "@/lib/format";
import { ACCESS_LEVELS, accessLevelOf } from "../access";

export function ApiKeysTable({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (key: ApiKey) => void }) {
  const columns: Column<ApiKey>[] = [
    {
      key: "name",
      header: "Name",
      cell: (k) => (
        <div className="grid">
          <span className="font-medium">{k.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span>
        </div>
      ),
    },
    { key: "access", header: "Access", cell: (k) => <Badge variant="outline">{ACCESS_LEVELS[accessLevelOf(k.scopes)].label}</Badge> },
    {
      key: "inboxes",
      header: "Inboxes",
      hideBelow: "md",
      cell: (k) => <span className="text-muted-foreground">{k.inbox_ids ? pluralize(k.inbox_ids.length, "inbox", "inboxes") : "All"}</span>,
    },
    { key: "used", header: "Last used", hideBelow: "sm", cell: (k) => <RelativeTime iso={k.last_used_at} className="text-muted-foreground" /> },
    { key: "created", header: "Created", hideBelow: "lg", cell: (k) => <RelativeTime iso={k.created_at} className="text-muted-foreground" /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-10 text-right",
      cell: (k) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${k.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent opensDialogs align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(k)}>
              Revoke key
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return <DataTable columns={columns} rows={keys} rowKey={(k) => k.id} />;
}
