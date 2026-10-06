import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMembers } from "@/features/members/api/use-members";
import { errorMessage } from "@/lib/api";
import type { WorkspaceRef } from "@/lib/auth-client";
import { useTransferWorkspace } from "../api/use-workspace-mutations";
import { SettingsSection } from "./settings-section";

/** Hand the workspace to an admin. The owner becomes an admin. */
export function TransferOwnershipSection({ workspace }: { workspace: WorkspaceRef }) {
  const members = useMembers();
  const admins = (members.data ?? []).filter((m) => m.role === "admin");
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const transfer = useTransferWorkspace();
  const chosen = admins.find((a) => a.user_id === target);
  return (
    <SettingsSection title="Transfer ownership" description="Make an admin the owner. You'll stay on as an admin.">
      {admins.length ? (
        <div className="flex flex-wrap gap-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-64" aria-label="New owner">
              <SelectValue placeholder="Choose an admin" />
            </SelectTrigger>
            <SelectContent>
              {admins.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.name ?? a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" disabled={!chosen} onClick={() => setConfirming(true)}>
            Transfer
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">Make someone an admin in Members first.</p>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Make ${chosen?.name ?? chosen?.email} the owner?`}
        description="They'll be able to delete the workspace and manage everyone, including you."
        confirmText={workspace.name}
        actionLabel="Transfer ownership"
        pending={transfer.isPending}
        onConfirm={() =>
          transfer.mutate(target, {
            onSuccess: () => {
              setConfirming(false);
              toast.success("Ownership transferred");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </SettingsSection>
  );
}
