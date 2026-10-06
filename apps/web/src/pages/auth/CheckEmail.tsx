import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "../../components/AuthLayout";
import { Alert, Button } from "../../components/ui";
import { http } from "../../lib/api";
import { useSubmit } from "../../lib/form";
import { useSession } from "../../lib/session";

export default function CheckEmail() {
  const { me, refresh } = useSession();
  const [sent, setSent] = useState(false);
  const { pending, error, run } = useSubmit();
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        <>
          We sent a confirmation link to{" "}
          <span className="font-medium text-fg">{me?.email}</span>. Click it to
          continue. It works for 24 hours.
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid place-items-center rounded-xl border border-line bg-surface py-8 text-accent">
          <MailCheck className="size-10" strokeWidth={1.5} />
        </div>
        {error && <Alert>{error}</Alert>}
        {sent && <Alert tone="ok">A new link is on its way.</Alert>}
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(() => http.post("/auth/resend-verification")).then(
              (r) => r && setSent(true)
            )
          }
        >
          Resend the email
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await http.post("/auth/logout");
            await refresh();
            navigate("/login");
          }}
        >
          Use a different account
        </Button>
        <p className="text-center text-sm text-faint">
          Not there? Check spam, or wait a minute and resend.
        </p>
      </div>
    </AuthLayout>
  );
}
