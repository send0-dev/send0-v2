import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AuthLayout, TextLink } from "../../components/AuthLayout";
import { Alert, Spinner } from "../../components/ui";
import { ApiError, http } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useSession();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use
    started.current = true;
    http
      .post("/auth/verify-email", { token: params.get("token") ?? "" })
      .then(async () => {
        const me = await refresh();
        navigate(me ? "/onboarding" : "/login?verified=1", { replace: true });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Something went wrong."));
  }, [params, refresh, navigate]);

  return (
    <AuthLayout title={error ? "That link didn't work" : "Confirming your email…"}>
      {error ? (
        <div className="grid gap-4">
          <Alert>{error}</Alert>
          <p className="text-sm text-muted">
            <TextLink to="/check-email">Send a new link</TextLink> or <TextLink to="/login">log in</TextLink>.
          </p>
        </div>
      ) : (
        <Spinner />
      )}
    </AuthLayout>
  );
}
