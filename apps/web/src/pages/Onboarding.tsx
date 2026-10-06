import {
  Check,
  Inbox as InboxIcon,
  KeyRound,
  Mail,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyField,
  Field,
  Input,
  Logo,
  cx,
} from "../components/ui";
import {
  api,
  http,
  type ApiKey,
  type Inbox,
  type List,
  type Message,
} from "../lib/api";
import { useSubmit } from "../lib/form";
import { useSession } from "../lib/session";

const STEPS = [
  { title: "Workspace", icon: Sparkles },
  { title: "First inbox", icon: InboxIcon },
  { title: "API key", icon: KeyRound },
  { title: "Try it", icon: Mail },
];

export default function Onboarding() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<number | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [key, setKey] = useState<string | null>(null);

  // Resume where the user left off.
  useEffect(() => {
    (async () => {
      if (!me?.org_id) return setStep(0);
      const inboxes = await api.get<List<Inbox>>("/inboxes?limit=1");
      if (!inboxes.data.length) return setStep(1);
      setInbox(inboxes.data[0]!);
      setStep(2);
    })().catch(() => setStep(0));
  }, [me?.org_id]);

  const finish = async () => {
    await http.post("/auth/onboarding/finish");
    // Once the session says "ready", the Gate follows `from`.
    navigate("/onboarding", {
      replace: true,
      state: { from: inbox ? `/inboxes/${inbox.id}` : "/inboxes" },
    });
    await refresh();
  };

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo />
        <span className="text-sm text-muted">{me?.email}</span>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-20 pt-4">
        <ol
          className="mb-10 grid grid-cols-4 gap-2"
          aria-label="Setup progress"
        >
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid gap-2">
              <div
                className={cx(
                  "h-1 rounded-full",
                  step !== null && i <= step ? "bg-accent" : "bg-line"
                )}
              />
              <span
                className={cx(
                  "flex items-center gap-1.5 text-xs",
                  step === i ? "font-medium text-fg" : "text-faint"
                )}
              >
                {step !== null && i < step ? (
                  <Check className="size-3.5 text-ok" />
                ) : (
                  <s.icon className="size-3.5" />
                )}
                {s.title}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <WorkspaceStep
            defaultName={me?.name ? `${me.name.split(" ")[0]}'s workspace` : ""}
            onDone={async () => (await refresh(), setStep(1))}
          />
        )}
        {step === 1 && (
          <InboxStep
            owner={me?.name ?? ""}
            onDone={(i) => (setInbox(i), setStep(2))}
          />
        )}
        {step === 2 && <KeyStep onDone={(k) => (setKey(k), setStep(3))} />}
        {step === 3 && inbox && (
          <TryStep inbox={inbox} apiKey={key} onFinish={finish} />
        )}
      </main>
    </div>
  );
}

function WorkspaceStep({
  defaultName,
  onDone,
}: {
  defaultName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const { pending, error, fieldErrors, run } = useSubmit();
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">
        Name your workspace
      </h1>
      <p className="mt-2 text-muted">
        Usually your company or project. Inboxes, keys and webhooks live here.
      </p>
      <form
        className="mt-8 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => http.post("/auth/workspace", { name }))) onDone();
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Workspace name" error={fieldErrors.name}>
          {(id) => (
            <Input
              id={id}
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme"
            />
          )}
        </Field>
        <Button type="submit" loading={pending}>
          Continue
        </Button>
      </form>
    </section>
  );
}

/** A likely-free default like "kunal-agent-4f2k"; shared addresses are first come, first served. */
const suggestAddress = (owner: string) => {
  const first = owner.toLowerCase().split(/\s+/)[0]!.replace(/[^a-z0-9]/g, "");
  return `${first || "my"}-agent-${Math.random().toString(36).slice(2, 6)}`;
};

function InboxStep({
  owner,
  onDone,
}: {
  owner: string;
  onDone: (inbox: Inbox) => void;
}) {
  const [name, setName] = useState(() => suggestAddress(owner));
  const { pending, error, fieldErrors, run } = useSubmit();
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">
        Create your first inbox
      </h1>
      <p className="mt-2 text-muted">
        A real address your agent can receive and reply from. You can make more
        later.
      </p>
      <form
        className="mt-8 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const inbox = await run(() =>
            api.post<Inbox>("/inboxes", { name: name.toLowerCase() })
          );
          if (inbox) onDone(inbox);
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field
          label="Address"
          error={fieldErrors.name}
          hint="Letters, numbers, dots, dashes and underscores."
        >
          {(id) => (
            <div className="flex items-center rounded-lg border border-line-strong bg-surface focus-within:border-accent">
              <input
                id={id}
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none"
              />
              <span className="pr-3 font-mono text-sm text-faint">
                @send0.email
              </span>
            </div>
          )}
        </Field>
        <Button type="submit" loading={pending}>
          Create inbox
        </Button>
      </form>
    </section>
  );
}

function KeyStep({ onDone }: { onDone: (key: string) => void }) {
  const [key, setKey] = useState<ApiKey | null>(null);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useSubmit();
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Your API key</h1>
      <p className="mt-2 text-muted">
        Your code and agents use this to call send0. It can read and send, but
        can't manage keys or webhooks.
      </p>
      <div className="mt-8 grid gap-4">
        {error && <Alert>{error}</Alert>}
        {!key ? (
          <Button
            loading={pending}
            onClick={() =>
              run(() =>
                api.post<ApiKey>("/api-keys", {
                  name: "Default key",
                  scopes: ["read", "send"],
                })
              ).then((k) => k && setKey(k))
            }
          >
            Create API key
          </Button>
        ) : (
          <>
            <CopyField value={key.key!} secret />
            <Alert tone="warn">
              This is the only time we'll show the full key. Store it somewhere
              safe, like a password manager or your secrets store.
            </Alert>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              I've stored my key
            </label>
            <Button disabled={!saved} onClick={() => onDone(key.key!)}>
              Continue
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function TryStep({
  inbox,
  apiKey,
  onFinish,
}: {
  inbox: Inbox;
  apiKey: string | null;
  onFinish: () => void;
}) {
  const [message, setMessage] = useState<Message | null>(null);
  const [tab, setTab] = useState<"ts" | "py" | "curl">("ts");
  const since = useRef(new Date(Date.now() - 60_000).toISOString());

  // Live wait, exactly like an agent would: returns the moment mail arrives.
  useEffect(() => {
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await api.get<{
            timed_out: boolean;
            message: Message | null;
          }>(
            `/inboxes/${inbox.id}/messages/wait?timeout=60&since=${encodeURIComponent(since.current)}`
          );
          if (!stop && r.message) return setMessage(r.message);
        } catch {
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [inbox.id]);

  const key = apiKey ?? "s0_live_…";
  const snippets = {
    ts: `import { Send0 } from "@send0/sdk";

const send0 = new Send0("${key}");
const msg = await send0.inboxes.wait("${inbox.id}", { timeout: 60 });
console.log(msg?.extracted_text, msg?.extracted?.otp);`,
    py: `from send0 import Send0

send0 = Send0("${key}")
msg = send0.inboxes.wait("${inbox.id}", timeout=60)
print(msg.extracted_text, msg.extracted.otp)`,
    curl: `curl "https://api.send0.dev/v1/inboxes/${inbox.id}/messages/wait?timeout=60" \\
  -H "Authorization: Bearer ${key}"`,
  };

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">
        Send it an email
      </h1>
      <p className="mt-2 text-muted">
        From your own mailbox, email{" "}
        <span className="font-medium text-fg">{inbox.address}</span>. It shows
        up here the moment it arrives.
      </p>

      <Card className="mt-6 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <CopyField value={inbox.address} />
        </div>
        {message ? (
          <div className="grid gap-2 rounded-lg bg-ok-soft p-4">
            <p className="flex items-center gap-2 font-medium text-ok">
              <Check className="size-4" /> It arrived
            </p>
            <p className="text-sm">
              <span className="text-muted">From</span> {message.from?.email} ·{" "}
              <span className="text-muted">Subject</span>{" "}
              {message.subject || "(no subject)"}
            </p>
            {message.extracted?.otp && (
              <p className="text-sm">
                Code found: <Badge tone="accent">{message.extracted.otp}</Badge>
              </p>
            )}
            {message.extracted_text && (
              <p className="line-clamp-3 text-sm text-muted">
                {message.extracted_text}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-subtle p-4 text-sm text-muted">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            Waiting for your email…
          </div>
        )}
      </Card>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">
        Do the same from code
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="flex gap-1 border-b border-line bg-subtle p-1.5">
          {(["ts", "py", "curl"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                "h-7 rounded-md px-2.5 text-sm",
                tab === t
                  ? "bg-surface font-medium shadow-sm"
                  : "text-muted hover:text-fg"
              )}
            >
              {{ ts: "TypeScript", py: "Python", curl: "cURL" }[t]}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto bg-surface p-4 font-mono text-[12.5px] leading-relaxed">
          {snippets[tab]}
        </pre>
      </div>
      <p className="mt-3 text-sm text-muted">
        Full guide:{" "}
        <a
          className="underline underline-offset-4"
          href="https://send0.dev/docs/quickstart/typescript"
        >
          quickstart
        </a>
      </p>

      <div className="mt-10 flex justify-end gap-3">
        {!message && (
          <Button variant="ghost" onClick={onFinish}>
            Skip for now
          </Button>
        )}
        <Button onClick={onFinish}>Go to dashboard</Button>
      </div>
    </section>
  );
}
