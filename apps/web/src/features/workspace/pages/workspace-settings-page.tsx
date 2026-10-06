import { toast } from "sonner";
import { z } from "zod";
import { CopyField } from "@/components/copy-field";
import { InlineTextForm } from "@/components/inline-text-form";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useCan } from "@/lib/permissions";
import { useRenameWorkspace } from "../api/use-workspace-mutations";
import { DeleteWorkspaceSection } from "../components/delete-workspace-section";
import { SettingsTitle } from "../components/settings-layout";
import { SettingsRow, SettingsSection } from "../components/settings-section";
import { TransferOwnershipSection } from "../components/transfer-ownership-section";

const workspaceName = z.string().trim().min(2, "Use 2–60 characters.").max(60, "Use 2–60 characters.");

export default function WorkspaceSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const rename = useRenameWorkspace();
  const canRename = useCan("workspace.rename");
  const isOwner = useCan("workspace.delete");
  return (
    <>
      <SettingsTitle title="General" description="How this workspace appears to everyone in it." />
      <SettingsSection title="Workspace">
        <SettingsRow label="Name" description={canRename ? "Shown to everyone in the workspace." : "Only owners and admins can rename it."}>
          <InlineTextForm
            value={workspace.name}
            label="Workspace name"
            schema={workspaceName}
            disabled={!canRename}
            pending={rename.isPending}
            onSave={(name, onError) => rename.mutate(name, { onSuccess: () => toast.success("Workspace renamed"), onError })}
          />
        </SettingsRow>
        <SettingsRow label="Workspace ID" description="For support requests and audit logs.">
          <CopyField value={workspace.id} className="w-60 max-sm:w-full" />
        </SettingsRow>
      </SettingsSection>
      {isOwner && <TransferOwnershipSection workspace={workspace} />}
      {isOwner && <DeleteWorkspaceSection workspace={workspace} />}
    </>
  );
}
