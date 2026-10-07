import type { Webhook } from "@send0/sdk";
import { MoreHorizontal, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/api";
import { useDeleteWebhook, useRotateWebhookSecret, useTestWebhook, useUpdateWebhook } from "../api/use-webhook-mutations";
import { SigningSecretDialog } from "./signing-secret-dialog";

/** Test, enable/disable, rotate the secret, delete. */
export function WebhookActions({ webhook }: { webhook: Webhook }) {
  const test = useTestWebhook(webhook.id);
  const update = useUpdateWebhook(webhook.id);
  const rotate = useRotateWebhookSecret();
  const del = useDeleteWebhook();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<"rotate" | "delete" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const enabled = webhook.status === "enabled";
  const fail = (e: unknown) => toast.error(errorMessage(e));

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" loading={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: () => toast.success("Test event sent"), onError: fail })}>
        <Send />
        Send test event
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent opensDialogs align="end">
          <DropdownMenuItem
            onSelect={() =>
              update.mutate({ status: enabled ? "disabled" : "enabled" }, { onSuccess: () => toast.success(enabled ? "Webhook disabled" : "Webhook enabled"), onError: fail })
            }
          >
            {enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm("rotate")}>Rotate signing secret</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            Delete webhook
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === "rotate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Rotate the signing secret?"
        description="The current secret stops working right away. Update your endpoint with the new one."
        actionLabel="Rotate secret"
        pending={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(webhook.id, {
            onSuccess: (w) => {
              setConfirm(null);
              setSecret(w.secret);
            },
            onError: fail,
          })
        }
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this webhook?"
        description={`${webhook.url} stops receiving events. Pending deliveries are dropped.`}
        actionLabel="Delete webhook"
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(webhook.id, {
            onSuccess: () => {
              toast.success("Webhook deleted");
              void navigate("/webhooks", { replace: true });
            },
            onError: fail,
          })
        }
      />
      <SigningSecretDialog secret={secret} title="Your new signing secret" onClose={() => setSecret(null)} />
    </div>
  );
}
