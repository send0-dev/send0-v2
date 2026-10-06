import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import type { InviteRow } from "@/lib/auth-client";
import { useResendInvite, useRevokeInvite } from "../api/use-member-mutations";
import { ROLE_INFO } from "../roles";

export function InvitesTable({ invites }: { invites: InviteRow[] }) {
  const resend = useResendInvite();
  const revoke = useRevokeInvite();
  const fail = (e: unknown) => toast.error(errorMessage(e));
  const columns: Column<InviteRow>[] = [
    { key: "email", header: "Email", cell: (i) => <span className="font-medium">{i.email}</span> },
    { key: "role", header: "Role", cell: (i) => <Badge variant="outline">{ROLE_INFO[i.role].label}</Badge> },
    { key: "by", header: "Invited by", hideBelow: "md", cell: (i) => <span className="text-muted-foreground">{i.invited_by ?? "—"}</span> },
    {
      key: "expires",
      header: "Expires",
      hideBelow: "sm",
      cell: (i) => (new Date(i.expires_at) < new Date() ? <Badge variant="destructive">Expired</Badge> : <RelativeTime iso={i.expires_at} className="text-muted-foreground" />),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-10 text-right",
      cell: (i) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${i.email}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => resend.mutate(i.id, { onSuccess: () => toast.success(`Sent a new invitation to ${i.email}`), onError: fail })}>
              Resend invitation
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => revoke.mutate(i.id, { onSuccess: () => toast("Invitation revoked"), onError: fail })}>
              Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return <DataTable columns={columns} rows={invites} rowKey={(i) => i.id} />;
}
