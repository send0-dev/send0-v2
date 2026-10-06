import type { ApiKey } from "@send0/sdk";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { errorMessage } from "@/lib/api";
import { useRevokeApiKey } from "../api/use-revoke-api-key";

export function RevokeApiKeyDialog({ apiKey, onOpenChange }: { apiKey: ApiKey | null; onOpenChange: (open: boolean) => void }) {
  const revoke = useRevokeApiKey();
  return (
    <ConfirmDialog
      open={!!apiKey}
      onOpenChange={onOpenChange}
      title={`Revoke “${apiKey?.name}”?`}
      description="Requests using this key start failing immediately. This can't be undone."
      actionLabel="Revoke key"
      pending={revoke.isPending}
      onConfirm={() =>
        apiKey &&
        revoke.mutate(apiKey.id, {
          onSuccess: () => {
            toast.success(`Revoked ${apiKey.name}`);
            onOpenChange(false);
          },
          onError: (e) => toast.error(errorMessage(e)),
        })
      }
    />
  );
}
