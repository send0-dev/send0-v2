import { PageHeader } from "@/components/page-header";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { SettingsSection } from "@/features/workspace/components/settings-section";
import { SettingsTabs } from "@/features/workspace/components/settings-tabs";
import { SessionsSection } from "../components/sessions-section";
import { ChangePasswordForm } from "../forms/change-password-form";
import { ProfileForm } from "../forms/profile-form";

export default function AccountPage() {
  const { user } = useCurrentWorkspace();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <div className="grid gap-5">
        <SettingsSection title="Profile">
          <ProfileForm name={user.name} email={user.email} />
        </SettingsSection>
        <SettingsSection title="Password" description="Changing it signs you out on every other device.">
          <ChangePasswordForm />
        </SettingsSection>
        <SessionsSection />
      </div>
    </>
  );
}
