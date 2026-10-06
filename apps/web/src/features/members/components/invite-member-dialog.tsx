import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InviteMemberForm } from "../forms/invite-member-form";

export function InviteMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They'll get an email with a link to join. It works for 7 days.</DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          onCancel={() => onOpenChange(false)}
          onInvited={(email) => {
            onOpenChange(false);
            toast.success(`Invitation sent to ${email}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
