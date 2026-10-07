import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "../forms/reset-password-form";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  return (
    <>
      <AuthHeader title="Choose a new password" description="You'll be signed out on every other device." />
      {token ? (
        <ResetPasswordForm
          token={token}
          onDone={() => {
            toast.success("Password changed");
            void navigate("/", { replace: true });
          }}
        />
      ) : (
        <Alert variant="destructive">
          This link is missing its token.{" "}
          <Link to="/forgot-password" className="underline underline-offset-2">
            Request a new one
          </Link>
          .
        </Alert>
      )}
    </>
  );
}
