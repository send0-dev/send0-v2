import type { ApiKeyWithSecret } from "@send0/sdk";
import { useState } from "react";
import { SecretReveal } from "@/components/secret-reveal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateApiKeyForm } from "../forms/create-api-key-form";

/** Create a key, then show it once. */
export function CreateApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [created, setCreated] = useState<ApiKeyWithSecret | null>(null);
  const close = () => {
    onOpenChange(false);
    setTimeout(() => setCreated(null), 200); // after the close animation
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => created && e.preventDefault()}>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new key</DialogTitle>
              <DialogDescription>{created.name}</DialogDescription>
            </DialogHeader>
            <SecretReveal value={created.key} what="API key" />
            <DialogFooter>
              <Button variant="primary" onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>Your code and agents send it as a Bearer token.</DialogDescription>
            </DialogHeader>
            <CreateApiKeyForm onCreated={setCreated} onCancel={close} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
