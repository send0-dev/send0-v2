import { canManageMember, type Role } from "@send0/auth/permissions";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { DataTable, type Column } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MemberRow } from "@/lib/auth-client";
import { ROLE_INFO } from "../roles";
import { RoleSelect } from "./role-select";

/** Everyone in the workspace. Rows you're allowed to manage get a role picker and a remove action. */
export function MembersTable({ members, myRole, myUserId, onRemove }: { members: MemberRow[]; myRole: Role; myUserId: string; onRemove: (m: MemberRow) => void }) {
  const manageable = (m: MemberRow) => m.user_id !== myUserId && canManageMember(myRole, m.role);
  const columns: Column<MemberRow>[] = [
    {
      key: "who",
      header: "Member",
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={m.name ?? m.email} size="md" />
          <div className="grid">
          <span className="font-medium">
            {m.name ?? m.email.split("@")[0]}
            {m.user_id === myUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
          </span>
          <span className="text-xs text-muted-foreground">{m.email}</span>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (m) => (manageable(m) ? <RoleSelect member={m} /> : <Badge variant="outline">{ROLE_INFO[m.role].label}</Badge>) },
    { key: "joined", header: "Joined", hideBelow: "sm", cell: (m) => <RelativeTime iso={m.joined_at} className="text-muted-foreground" /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-10 text-right",
      cell: (m) =>
        manageable(m) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.email}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent opensDialogs align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => onRemove(m)}>
                Remove from workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
  ];
  return <DataTable columns={columns} rows={members} rowKey={(m) => m.user_id} />;
}
