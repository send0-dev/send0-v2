import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/features/workspace/components/settings-section";
import { errorMessage } from "@/lib/api";
import { useLeaveWorkspace } from "../api/use-member-mutations";

export function LeaveWorkspaceSection({ workspaceName }: { workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const leave = useLeaveWorkspace();
  return (
    <SettingsSection danger title="Danger zone">
      <SettingsRow label="Leave workspace" description="You'll lose access to its inboxes. An admin can invite you back.">
        <Button variant="destructive-outline" onClick={() => setOpen(true)}>
          Leave {workspaceName}
        </Button>
      </SettingsRow>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${workspaceName}?`}
        description="You'll lose access right away."
        actionLabel="Leave workspace"
        pending={leave.isPending}
        onConfirm={() => leave.mutate(undefined, { onSuccess: () => toast(`You left ${workspaceName}`), onError: (e) => toast.error(errorMessage(e)) })}
      />
    </SettingsSection>
  );
}
