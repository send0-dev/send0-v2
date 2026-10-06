import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/features/session/api/use-me";
import { useVerifyEmail } from "../api/use-auth-mutations";

/** Opened from the email link: confirms the address once, then moves on. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const verify = useVerifyEmail();
  const me = useMe();
  const navigate = useNavigate();
  const started = useRef(false); // tokens are single-use: never send twice (StrictMode runs effects twice)

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token, {
      onSuccess: async () => {
        const fresh = await me.refetch();
        navigate(fresh.data?.user ? "/" : "/login?verified=1", { replace: true });
      },
    });
  }, [token]); // once per token; the ref above guards against StrictMode's second run

  if (!token || verify.isError) {
    return (
      <>
        <AuthHeader title="This link didn't work" />
        <Alert variant="destructive" className="mb-5">
          {token ? errorMessage(verify.error) : "The link is missing its token."}
        </Alert>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/check-email">Send a new link</Link>
        </Button>
      </>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-live="polite">
      <Loader2 className="size-4 animate-spin" />
      Confirming your email…
    </div>
  );
}
