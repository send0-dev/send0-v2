import type { Inbox } from "@send0/sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useDeleteInbox } from "../api/use-inbox-mutations";

export function DeleteInboxSection({ inbox }: { inbox: Inbox }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteInbox();
  const navigate = useNavigate();
  return (
    <section className="grid gap-2 rounded-lg border border-destructive/30 p-4">
      <h3 className="text-[13px] font-medium">Delete inbox</h3>
      <p className="text-[13px] text-muted-foreground">Mail to {inbox.address} is refused from then on, and the address is never reused.</p>
      <div>
        <Button variant="destructive-outline" size="sm" onClick={() => setOpen(true)}>
          Delete inbox
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this inbox?"
        description={`Its threads and messages will be deleted, and mail to ${inbox.address} will be refused.`}
        confirmText={inbox.address}
        actionLabel="Delete inbox"
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(inbox.id, {
            onSuccess: () => {
              toast.success(`Deleted ${inbox.address}`);
              void navigate("/inboxes", { replace: true });
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </section>
  );
}
