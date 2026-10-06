import type { Draft } from "@send0/sdk";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditDraftForm } from "../forms/edit-draft-form";

export function EditDraftDialog({ draft, onOpenChange }: { draft: Draft | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!draft} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit draft</DialogTitle>
          <DialogDescription>To {draft?.to.map((t) => t.email).join(", ")}</DialogDescription>
        </DialogHeader>
        {draft && (
          <EditDraftForm
            draft={draft}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              toast.success("Draft saved");
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
