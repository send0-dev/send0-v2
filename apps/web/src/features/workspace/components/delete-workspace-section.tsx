import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import type { WorkspaceRef } from "@/lib/auth-client";
import { useDeleteWorkspace } from "../api/use-workspace-mutations";
import { SettingsRow, SettingsSection } from "./settings-section";

export function DeleteWorkspaceSection({ workspace }: { workspace: WorkspaceRef }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteWorkspace();
  return (
    <SettingsSection danger title="Danger zone">
      <SettingsRow label="Delete workspace" description="Keys stop working, webhooks stop and inboxes refuse mail at once. Everything is erased after 30 days.">
        <Button variant="destructive-outline" onClick={() => setOpen(true)}>
          Delete workspace
        </Button>
      </SettingsRow>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this workspace?"
        description="Every inbox, message, key and webhook in it goes with it. Members lose access."
        confirmText={workspace.name}
        actionLabel="Delete workspace"
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(workspace.name, {
            onSuccess: () => toast.success(`Deleted ${workspace.name}`),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </SettingsSection>
  );
}
