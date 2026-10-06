import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/features/workspace/components/settings-section";
import { errorMessage } from "@/lib/api";
import { useRevokeOtherSessions } from "../api/use-account-mutations";

export function SessionsSection() {
  const revoke = useRevokeOtherSessions();
  return (
    <SettingsSection title="Sessions">
      <SettingsRow label="Other devices" description="Signed in on a shared or lost device? Sign out everywhere except here.">
      <Button
        loading={revoke.isPending}
        onClick={() => revoke.mutate(undefined, { onSuccess: () => toast.success("Signed out of every other device"), onError: (e) => toast.error(errorMessage(e)) })}
      >
        Sign out other devices
      </Button>
      </SettingsRow>
    </SettingsSection>
  );
}
