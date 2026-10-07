import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AuthHeader } from "@/app/layouts/auth-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import type { InvitePreview } from "@/lib/auth-client";
import { useMe } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";
import { useAcceptInvite, useInvitePreview } from "../api/use-invite";
import { InviteSignupForm } from "../forms/invite-signup-form";

const article = (role: string) => (role === "admin" ? "an admin" : "a member");

function InviteSummary({ invite }: { invite: InvitePreview }) {
  return (
    <AuthHeader
      title={`Join ${invite.workspace}`}
      description={
        <>
          {invite.invited_by ?? "Someone"} invited <span className="font-medium text-foreground">{invite.email}</span> to join as{" "}
          {article(invite.role)}.
        </>
      }
    />
  );
}

/** Opened from an invitation email. Works signed out (sign up or log in) and signed in (accept). */
export default function AcceptInvitePage() {
  const { token = "" } = useParams();
  const preview = useInvitePreview(token);
  const me = useMe();
  const accept = useAcceptInvite(token);
  const logOut = useLogOut();

  if (preview.isPending || me.isPending) return <Skeleton className="h-40 w-full" />;
  if (preview.isError) {
    return (
      <>
        <AuthHeader title="This invitation isn't valid" />
        <Alert variant="destructive" className="mb-5">
          {errorMessage(preview.error)}
        </Alert>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/">Go to send0</Link>
        </Button>
      </>
    );
  }

  const invite = preview.data;
  const user = me.data?.user;
  const next = `?next=${encodeURIComponent(`/invite/${token}`)}`;

  if (user && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <>
        <InviteSummary invite={invite} />
        <Alert variant="warning" className="mb-5">
          You're signed in as {user.email}. Log out, then open the invitation again with {invite.email}.
        </Alert>
        <Button className="w-full" variant="secondary" onClick={() => logOut.mutate()}>
          Log out
        </Button>
      </>
    );
  }

  if (user) {
    return (
      <>
        <InviteSummary invite={invite} />
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          loading={accept.isPending || accept.isSuccess}
          onClick={() => accept.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
        >
          Accept and join {invite.workspace}
        </Button>
      </>
    );
  }

  return (
    <>
      <InviteSummary invite={invite} />
      {invite.has_account ? (
        <Button asChild variant="primary" size="lg" className="w-full">
          <Link to={`/login${next}`}>Log in to accept</Link>
        </Button>
      ) : (
        <InviteSignupForm token={token} email={invite.email} workspace={invite.workspace} />
      )}
    </>
  );
}
