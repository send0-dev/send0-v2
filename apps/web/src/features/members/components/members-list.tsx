import { canManageMember, type Role } from "@send0/auth/permissions";
import { MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MemberRow } from "@/lib/auth-client";
import { ROLE_INFO } from "../roles";
import { RoleSelect } from "./role-select";

/** Everyone in the workspace. Rows you may manage get a role picker and a remove action. */
export function MembersList({
  members,
  myRole,
  myUserId,
  onRemove,
}: {
  members: MemberRow[];
  myRole: Role;
  myUserId: string;
  onRemove: (m: MemberRow) => void;
}) {
  const manageable = (m: MemberRow) => m.user_id !== myUserId && canManageMember(myRole, m.role);
  return (
    <ul>
      {members.map((m) => (
        <li key={m.user_id} className="flex min-h-14 items-center gap-3 border-b px-5 py-2.5 last:border-b-0">
          <Avatar name={m.name ?? m.email} size="lg" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[13px] font-medium">
              {m.name ?? m.email.split("@")[0]}
              {m.user_id === myUserId && <span className="ml-1.5 text-xs font-normal text-faint">you</span>}
            </span>
            <span className="truncate text-xs text-muted-foreground">{m.email}</span>
          </span>
          <span className="w-20 shrink-0 text-right text-xs text-faint max-sm:hidden">
            <RelativeTime iso={m.joined_at} />
          </span>
          <span className="flex w-28 shrink-0 justify-end">
            {manageable(m) ? <RoleSelect member={m} /> : <Badge variant="outline">{ROLE_INFO[m.role].label}</Badge>}
          </span>
          <span className="w-6 shrink-0">
            {manageable(m) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${m.email}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent opensDialogs align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => onRemove(m)}>
                    Remove from workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
