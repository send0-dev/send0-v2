import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/features/workspace/components/settings-section";
import { errorMessage } from "@/lib/api";
import { useRevokeOtherSessions } from "../api/use-account-mutations";

export function SessionsSection() {
  const revoke = useRevokeOtherSessions();
  return (
    <SettingsSection title="Sessions" description="Signed in on a shared or lost device? Sign out everywhere except here.">
      <Button
        variant="secondary"
        loading={revoke.isPending}
        onClick={() => revoke.mutate(undefined, { onSuccess: () => toast.success("Signed out of every other device"), onError: (e) => toast.error(errorMessage(e)) })}
      >
        Sign out other devices
      </Button>
    </SettingsSection>
  );
}
