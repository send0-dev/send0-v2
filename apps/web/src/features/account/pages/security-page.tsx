import { SettingsTitle } from "@/features/workspace/components/settings-layout";
import { SettingsSection } from "@/features/workspace/components/settings-section";
import { SessionsSection } from "../components/sessions-section";
import { ChangePasswordForm } from "../forms/change-password-form";

export default function SecurityPage() {
  return (
    <>
      <SettingsTitle title="Security" description="Your password and where you're signed in." />
      <SettingsSection title="Password" description="Changing it signs you out on every other device.">
        <ChangePasswordForm />
      </SettingsSection>
      <SessionsSection />
    </>
  );
}
