import { Link, useSearchParams } from "react-router";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "../forms/login-form";

export default function LoginPage() {
  const [params] = useSearchParams();
  return (
    <>
      <AuthHeader title="Log in to send0" description="Welcome back." />
      {params.get("verified") && (
        <Alert variant="success" className="mb-5">
          Email confirmed. Log in to continue.
        </Alert>
      )}
      <LoginForm />
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        New to send0?{" "}
        <Link
          to={`/signup${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
