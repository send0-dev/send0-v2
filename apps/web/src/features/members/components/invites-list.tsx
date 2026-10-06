import { Mail, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import type { InviteRow } from "@/lib/auth-client";
import { useResendInvite, useRevokeInvite } from "../api/use-member-mutations";
import { ROLE_INFO } from "../roles";

export function InvitesList({ invites }: { invites: InviteRow[] }) {
  const resend = useResendInvite();
  const revoke = useRevokeInvite();
  const fail = (e: unknown) => toast.error(errorMessage(e));
  return (
    <ul>
      {invites.map((i) => {
        const expired = new Date(i.expires_at) < new Date();
        return (
          <li key={i.id} className="flex min-h-14 items-center gap-3 border-b px-5 py-2.5 last:border-b-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong">
              <Mail className="size-3.5 text-faint" />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[13px] font-medium">{i.email}</span>
              <span className="truncate text-xs text-muted-foreground">Invited by {i.invited_by ?? "a teammate"}</span>
            </span>
            <span className="w-20 shrink-0 text-right text-xs max-sm:hidden">
              {expired ? (
                <span className="text-destructive">Expired</span>
              ) : (
                <span className="text-faint">
                  expires <RelativeTime iso={i.expires_at} />
                </span>
              )}
            </span>
            <span className="flex w-28 shrink-0 justify-end">
              <Badge variant="outline">{ROLE_INFO[i.role].label}</Badge>
            </span>
            <span className="w-6 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${i.email}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => resend.mutate(i.id, { onSuccess: () => toast.success(`Sent a new invitation to ${i.email}`), onError: fail })}>Resend invitation</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => revoke.mutate(i.id, { onSuccess: () => toast("Invitation revoked"), onError: fail })}>
                    Revoke
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
