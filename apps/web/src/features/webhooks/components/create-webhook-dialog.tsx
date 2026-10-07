import { useNavigate } from "react-router";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateWebhookForm } from "../forms/create-webhook-form";
import { SigningSecretDialog } from "./signing-secret-dialog";

export function CreateWebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const navigate = useNavigate();
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add endpoint</DialogTitle>
            <DialogDescription>Get a signed POST for new mail, deliveries, bounces and drafts.</DialogDescription>
          </DialogHeader>
          <CreateWebhookForm
            onCancel={() => onOpenChange(false)}
            onCreated={(w) => {
              onOpenChange(false);
              setCreated({ id: w.id, secret: w.secret });
            }}
          />
        </DialogContent>
      </Dialog>
      <SigningSecretDialog
        secret={created?.secret ?? null}
        onClose={() => {
          const id = created?.id;
          setCreated(null);
          if (id) void navigate(`/webhooks/${id}`);
        }}
      />
    </>
  );
}
