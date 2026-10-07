import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateWorkspace } from "@/features/session/api/use-session-actions";
import { WorkspaceNameForm } from "../forms/workspace-name-form";

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateWorkspace();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            Separate inboxes, keys and teammates, e.g. for another product or client. You'll be its owner.
          </DialogDescription>
        </DialogHeader>
        <WorkspaceNameForm
          autoFocus
          submitLabel="Create workspace"
          pending={create.isPending}
          onSubmit={(name, onError) =>
            create.mutate(name, {
              onSuccess: (w) => {
                onOpenChange(false);
                toast.success(`Switched to ${w.name}`);
              },
              onError,
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
