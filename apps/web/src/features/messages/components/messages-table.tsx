import type { Message } from "@send0/sdk";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { mailboxShort } from "./mailbox";

export function MessagesTable({ messages, onOpen, inboxAddress }: { messages: Message[]; onOpen: (m: Message) => void; inboxAddress: (id: string) => string | undefined }) {
  const columns: Column<Message>[] = [
    {
      key: "dir",
      header: <span className="sr-only">Direction</span>,
      className: "w-8 pr-0",
      cell: (m) => (
        <Tooltip content={m.direction === "in" ? "Received" : "Sent"}>
          {m.direction === "in" ? <ArrowDownLeft className="size-4 text-muted-foreground" /> : <ArrowUpRight className="size-4 text-info" />}
        </Tooltip>
      ),
    },
    {
      key: "who",
      header: "From / to",
      className: "max-w-48",
      cell: (m) => <span className="block truncate">{m.direction === "in" ? mailboxShort(m.from) : m.to.map((t) => t.email).join(", ")}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      cell: (m) => (
        <div className="grid min-w-0 max-w-[28rem]">
          <span className="truncate font-medium">{m.subject || "(no subject)"}</span>
          <span className="truncate text-xs text-muted-foreground">{(m.extracted_text ?? m.text ?? "").slice(0, 160)}</span>
        </div>
      ),
    },
    { key: "inbox", header: "Inbox", hideBelow: "lg", cell: (m) => <span className="font-mono text-xs text-muted-foreground">{inboxAddress(m.inbox_id) ?? m.inbox_id}</span> },
    { key: "status", header: "Status", hideBelow: "md", cell: (m) => <StatusBadge status={m.status} /> },
    { key: "when", header: "When", className: "text-right", cell: (m) => <RelativeTime iso={m.created_at} className="text-xs text-muted-foreground" /> },
  ];
  return <DataTable columns={columns} rows={messages} rowKey={(m) => m.id} onRowClick={onOpen} />;
}
