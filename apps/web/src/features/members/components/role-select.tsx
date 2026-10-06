import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import type { MemberRow } from "@/lib/auth-client";
import { useChangeRole } from "../api/use-member-mutations";
import { ROLE_INFO } from "../roles";

/** Changes a member's role in place. */
export function RoleSelect({ member }: { member: MemberRow }) {
  const change = useChangeRole();
  return (
    <Select
      value={member.role}
      disabled={change.isPending}
      onValueChange={(role) =>
        change.mutate(
          { userId: member.user_id, role: role as "admin" | "member" },
          { onSuccess: () => toast.success(`${member.name ?? member.email} is now ${ROLE_INFO[role as "admin"].label.toLowerCase()}`), onError: (e) => toast.error(errorMessage(e)) }
        )
      }
    >
      <SelectTrigger className="h-7 w-28 text-[13px]" aria-label={`Role for ${member.email}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="member">Member</SelectItem>
      </SelectContent>
    </Select>
  );
}
