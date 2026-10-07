import { Link } from "react-router";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { useInstance } from "@/features/session/api/use-instance";
import { SignupForm } from "../forms/signup-form";

const loginLink = (
  <p className="mt-6 text-center text-[13px] text-muted-foreground">
    Already have an account?{" "}
    <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
      Log in
    </Link>
  </p>
);

export default function SignupPage() {
  const instance = useInstance();
  if (instance.data && !instance.data.signup_open) {
    return (
      <>
        <AuthHeader
          title="Sign-up is closed"
          description="This send0 is invite-only. Ask a workspace owner to invite you, then open the link in that email."
        />
        {loginLink}
      </>
    );
  }
  return (
    <>
      <AuthHeader title="Create your account" description="Give your agents real email inboxes. It takes a minute." />
      <SignupForm />
      <p className="mt-4 text-center text-xs text-muted-foreground">
        By creating an account you agree to the{" "}
        <a href="https://send0.dev/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </a>{" "}
        and{" "}
        <a href="https://send0.dev/acceptable-use" className="underline underline-offset-2 hover:text-foreground">
          Acceptable Use Policy
        </a>
        .
      </p>
      {loginLink}
    </>
  );
}
