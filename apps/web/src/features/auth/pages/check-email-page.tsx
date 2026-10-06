import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";
import { useResendVerification } from "../api/use-auth-mutations";

const COOLDOWN_S = 30;

/** Sign-up's second step: confirm the email address. Re-checks when the tab regains focus. */
export default function CheckEmailPage() {
  const me = useMe();
  const resend = useResendVerification();
  const logOut = useLogOut();
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <>
      <MailCheck className="mb-4 size-6 text-muted-foreground" />
      <AuthHeader
        title="Confirm your email"
        description={
          <>
            We sent a link to <span className="font-medium text-foreground">{me.data?.user?.email}</span>. Open it to finish setting up. It works for 24 hours.
          </>
        }
      />
      <div className="grid gap-2">
        <Button
          variant="secondary"
          disabled={wait > 0}
          loading={resend.isPending}
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: () => {
                toast.success("Sent a new link");
                setWait(COOLDOWN_S);
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {wait > 0 ? `Send again in ${wait}s` : "Send the link again"}
        </Button>
        <Button variant="ghost" onClick={() => logOut.mutate()}>
          Use a different email
        </Button>
      </div>
      <p className="mt-6 text-[13px] text-muted-foreground">Can't find it? Check spam, or search for “send0”.</p>
    </>
  );
}
