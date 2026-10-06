import type { Inbox } from "@send0/sdk";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useMe } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";
import { Stepper } from "../components/stepper";
import { InboxStep } from "../steps/inbox-step";
import { KeyStep } from "../steps/key-step";
import { TryStep } from "../steps/try-step";
import { WorkspaceStep } from "../steps/workspace-step";

const STEPS = ["Workspace", "First inbox", "API key", "Try it"];

/** Four steps from a verified account to a working inbox. Resumes where the person left off. */
export default function OnboardingPage() {
  const me = useMe();
  const hasWorkspace = !!me.data?.workspace;
  const inboxes = useInboxes({ enabled: hasWorkspace });
  const logOut = useLogOut();
  const [step, setStep] = useState<number | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Work out the starting step once: no workspace → 0, no inbox → 1, otherwise the key step.
  useEffect(() => {
    if (step !== null) return;
    if (!hasWorkspace) return setStep(0);
    if (!inboxes.isSuccess) return;
    const first = inboxes.items[0];
    if (!first) return setStep(1);
    setInbox(first);
    setStep(2);
  }, [step, hasWorkspace, inboxes.isSuccess, inboxes.items]);

  const user = me.data?.user;
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <button type="button" className="cursor-pointer text-[13px] text-muted-foreground hover:text-foreground" onClick={() => logOut.mutate()}>
          {user?.email} · Log out
        </button>
      </header>
      <main className="mx-auto max-w-lg px-4 pt-6 pb-24">
        {step === null ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <Stepper steps={STEPS} current={step} />
            {step === 0 && <WorkspaceStep defaultName={user?.name ? `${user.name.split(" ")[0]}'s workspace` : ""} onDone={() => setStep(1)} />}
            {step === 1 && <InboxStep owner={user?.name ?? null} onDone={(i) => (setInbox(i), setStep(2))} />}
            {step === 2 && <KeyStep onDone={(k) => (setApiKey(k), setStep(3))} />}
            {step === 3 && inbox && <TryStep inbox={inbox} apiKey={apiKey} />}
          </>
        )}
      </main>
    </div>
  );
}
