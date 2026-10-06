import { toast } from "sonner";
import { z } from "zod";
import { useTheme, type ThemeChoice } from "@/app/theme";
import { InlineTextForm } from "@/components/inline-text-form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { SettingsTitle } from "@/features/workspace/components/settings-layout";
import { SettingsRow, SettingsSection } from "@/features/workspace/components/settings-section";
import { useUpdateProfile } from "../api/use-account-mutations";

const name = z.string().trim().max(80, "Use at most 80 characters.");

export default function AccountPage() {
  const { user } = useCurrentWorkspace();
  const { choice, setChoice } = useTheme();
  const update = useUpdateProfile();
  return (
    <>
      <SettingsTitle title="Profile" description="How you appear to teammates." />
      <SettingsSection title="Profile">
        <SettingsRow label="Name" description="Shown to teammates and on invitations you send.">
          <InlineTextForm
            value={user.name ?? ""}
            label="Your name"
            placeholder="Your name"
            schema={name}
            pending={update.isPending}
            onSave={(v, onError) => update.mutate({ name: v || null }, { onSuccess: () => toast.success("Profile saved"), onError })}
          />
        </SettingsRow>
        <SettingsRow label="Email" description="To change it, email support@send0.dev from this address.">
          <span className="w-60 truncate text-[13px] text-muted-foreground max-sm:w-full">{user.email}</span>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Preferences">
        <SettingsRow label="Theme" description="Follow your system, or pick one.">
          <Tabs value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
            <TabsList aria-label="Theme">
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
