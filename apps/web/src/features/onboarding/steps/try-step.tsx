import type { Inbox } from "@send0/sdk";
import { Check } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { ExtractedDetails } from "@/features/messages/components/extracted-details";
import { mailboxShort } from "@/features/messages/mailbox-names";
import { useFirstMessage, useFinishOnboarding } from "../api/use-onboarding";
import { StepHeader } from "../components/step-header";
import { CodeSnippets } from "./code-snippets";

/** The last step: send the inbox a real email and watch it arrive, then see the same call in code. */
export function TryStep({ inbox, apiKey }: { inbox: Inbox; apiKey: string | null }) {
  const first = useFirstMessage(inbox.id);
  const finish = useFinishOnboarding();
  const message = first.data ?? null;
  return (
    <>
      <StepHeader
        title="Send it an email"
        description={<>From your own mailbox, email {inbox.address}. It shows up here the moment it arrives.</>}
      />
      <div className="grid gap-3">
        <CopyField value={inbox.address} label="Copy address" />
        {message ? (
          <div className="grid animate-enter gap-2 rounded-lg border border-success/25 bg-success-soft p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
              <Check className="size-4" /> It arrived
            </p>
            <p className="text-[13px]">
              <span className="text-muted-foreground">From</span> {mailboxShort(message.from)} ·{" "}
              <span className="text-muted-foreground">Subject</span> {message.subject || "(no subject)"}
            </p>
            <ExtractedDetails extracted={message.extracted} />
          </div>
        ) : first.isError ? (
          <p className="rounded-md bg-muted/60 p-3.5 text-[13px] text-muted-foreground">
            The live preview stopped. Your email still arrives: you'll find it in the inbox on the dashboard.
          </p>
        ) : (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-dashed p-3.5 text-[13px] text-muted-foreground"
            aria-live="polite"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            Waiting for your email…
          </div>
        )}
      </div>
      <h2 className="mt-8 mb-3 text-xs font-medium text-muted-foreground">Do the same from code</h2>
      <CodeSnippets inboxId={inbox.id} apiKey={apiKey ?? "s0_live_…"} />
      <div className="mt-8 flex justify-end gap-2">
        {!message && (
          <Button variant="ghost" onClick={() => finish.mutate("/")} disabled={finish.isPending}>
            Skip for now
          </Button>
        )}
        <Button variant="primary" loading={finish.isPending} onClick={() => finish.mutate(`/inboxes/${inbox.id}`)}>
          Go to dashboard
        </Button>
      </div>
    </>
  );
}
