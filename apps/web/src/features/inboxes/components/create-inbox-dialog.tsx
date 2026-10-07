import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMailDomain } from "@/features/session/api/use-instance";
import { CreateInboxForm } from "../forms/create-inbox-form";

export function CreateInboxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const domain = useMailDomain();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New inbox</DialogTitle>
          <DialogDescription>A real address that can receive, reply and thread.</DialogDescription>
        </DialogHeader>
        <CreateInboxForm
          domain={domain}
          onCancel={() => onOpenChange(false)}
          onCreated={(inbox) => {
            onOpenChange(false);
            toast.success(`Created ${inbox.address}`);
            void navigate(`/inboxes/${inbox.id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
