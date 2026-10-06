import { toast } from "sonner";
import { CopyField } from "@/components/copy-field";
import { PageHeader } from "@/components/page-header";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useCan } from "@/lib/permissions";
import { useRenameWorkspace } from "../api/use-workspace-mutations";
import { DeleteWorkspaceSection } from "../components/delete-workspace-section";
import { SettingsSection } from "../components/settings-section";
import { SettingsTabs } from "../components/settings-tabs";
import { TransferOwnershipSection } from "../components/transfer-ownership-section";
import { WorkspaceNameForm } from "../forms/workspace-name-form";

export default function WorkspaceSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const rename = useRenameWorkspace();
  const canRename = useCan("workspace.rename");
  const isOwner = useCan("workspace.delete");
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <div className="grid gap-5">
        <SettingsSection title="General" description={canRename ? "The name everyone in the workspace sees." : "Only owners and admins can rename the workspace."}>
          <div className="grid gap-5">
            <WorkspaceNameForm
              defaultName={workspace.name}
              disabled={!canRename}
              submitLabel="Save"
              pending={rename.isPending}
              onSubmit={(name, onError) => rename.mutate(name, { onSuccess: () => toast.success("Workspace renamed"), onError })}
            />
            <div className="grid gap-1.5">
              <p className="text-[13px] font-medium">Workspace ID</p>
              <CopyField value={workspace.id} className="max-w-sm" />
            </div>
          </div>
        </SettingsSection>
        {isOwner && <TransferOwnershipSection workspace={workspace} />}
        {isOwner && <DeleteWorkspaceSection workspace={workspace} />}
      </div>
    </>
  );
}
