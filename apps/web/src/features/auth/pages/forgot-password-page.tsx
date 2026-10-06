import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { ForgotPasswordForm } from "../forms/forgot-password-form";

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return (
    <>
      {sentTo ? (
        <>
          <MailCheck className="mb-4 size-6 text-muted-foreground" />
          <AuthHeader
            title="Check your email"
            description={
              <>
                If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we've sent a link to reset its password. It works for one hour.
              </>
            }
          />
        </>
      ) : (
        <>
          <AuthHeader title="Reset your password" description="We'll email you a link to choose a new one." />
          <ForgotPasswordForm onSent={setSentTo} />
        </>
      )}
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
