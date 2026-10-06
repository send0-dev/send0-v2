import { SecretReveal } from "@/components/secret-reveal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a webhook signing secret once (after creating or rotating). */
export function SigningSecretDialog({ secret, onClose, title = "Save your signing secret" }: { secret: string | null; onClose: () => void; title?: string }) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Use it to check the <code className="font-mono text-xs">send0-signature</code> header on every delivery.
          </DialogDescription>
        </DialogHeader>
        {secret && <SecretReveal value={secret} what="signing secret" />}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
