import { useTheme, type ThemeChoice } from "@/app/theme";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { SettingsTitle } from "@/features/workspace/components/settings-layout";
import { SettingsRow, SettingsSection } from "@/features/workspace/components/settings-section";
import { ProfileForm } from "../forms/profile-form";

export default function AccountPage() {
  const { user } = useCurrentWorkspace();
  const { choice, setChoice } = useTheme();
  return (
    <>
      <SettingsTitle title="Profile" description="How you appear to teammates." />
      <SettingsSection title="Profile">
        <ProfileForm name={user.name} email={user.email} />
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
