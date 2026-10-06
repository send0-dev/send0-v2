import { toast } from "sonner";
import { CopyField } from "@/components/copy-field";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useCan } from "@/lib/permissions";
import { useRenameWorkspace } from "../api/use-workspace-mutations";
import { DeleteWorkspaceSection } from "../components/delete-workspace-section";
import { SettingsTitle } from "../components/settings-layout";
import { SettingsRow, SettingsSection } from "../components/settings-section";
import { TransferOwnershipSection } from "../components/transfer-ownership-section";
import { WorkspaceNameForm } from "../forms/workspace-name-form";

export default function WorkspaceSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const rename = useRenameWorkspace();
  const canRename = useCan("workspace.rename");
  const isOwner = useCan("workspace.delete");
  return (
    <>
      <SettingsTitle title="General" description="How this workspace appears to everyone in it." />
      <SettingsSection title="Workspace" description={canRename ? undefined : "Only owners and admins can rename the workspace."}>
        <WorkspaceNameForm
          defaultName={workspace.name}
          disabled={!canRename}
          submitLabel="Save"
          pending={rename.isPending}
          onSubmit={(name, onError) => rename.mutate(name, { onSuccess: () => toast.success("Workspace renamed"), onError })}
        />
      </SettingsSection>
      <SettingsSection title="Identifiers">
        <SettingsRow label="Workspace ID" description="For support requests and audit logs.">
          <CopyField value={workspace.id} className="w-56" />
        </SettingsRow>
      </SettingsSection>
      {isOwner && <TransferOwnershipSection workspace={workspace} />}
      {isOwner && <DeleteWorkspaceSection workspace={workspace} />}
    </>
  );
}
