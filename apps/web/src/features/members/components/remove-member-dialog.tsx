import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { errorMessage } from "@/lib/api";
import type { MemberRow } from "@/lib/auth-client";
import { useRemoveMember } from "../api/use-member-mutations";

export function RemoveMemberDialog({ member, onOpenChange }: { member: MemberRow | null; onOpenChange: (open: boolean) => void }) {
  const remove = useRemoveMember();
  const who = member?.name ?? member?.email;
  return (
    <ConfirmDialog
      open={!!member}
      onOpenChange={onOpenChange}
      title={`Remove ${who}?`}
      description="They lose access to this workspace right away. Their API keys keep working until you revoke them."
      actionLabel="Remove"
      pending={remove.isPending}
      onConfirm={() =>
        member &&
        remove.mutate(member.user_id, {
          onSuccess: () => {
            toast.success(`Removed ${who}`);
            onOpenChange(false);
          },
          onError: (e) => toast.error(errorMessage(e)),
        })
      }
    />
  );
}
