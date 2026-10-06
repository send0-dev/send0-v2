import {
  ArrowLeft,
  Paperclip,
  RefreshCw,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyField,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  cx,
  timeAgo,
} from "../components/ui";
import {
  api,
  type Inbox as InboxT,
  type List,
  type Message,
  type Thread,
} from "../lib/api";
import { useSubmit } from "../lib/form";
import { useLoad } from "../lib/useLoad";
import { POLICY_LABEL } from "./Inboxes";

export default function Inbox() {
  const { inboxId = "", threadId } = useParams();
  const inbox = useLoad(
    () => api.get<InboxT>(`/inboxes/${inboxId}`),
    [inboxId]
  );
  const threads = useLoad(
    () => api.get<List<Thread>>(`/inboxes/${inboxId}/threads?limit=50`),
    [inboxId]
  );
  const [settings, setSettings] = useState(false);

  if (inbox.error) return <Alert>{inbox.error}</Alert>;
  if (!inbox.data) return <Spinner />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/inboxes"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
          >
            <ArrowLeft className="size-3.5" /> Inboxes
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {inbox.data.address}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono text-xs text-faint">
              {inbox.data.id}
            </span>
            <Badge
              tone={inbox.data.send_policy === "approval" ? "warn" : "neutral"}
            >
              {POLICY_LABEL[inbox.data.send_policy]}
            </Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => threads.reload()}
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSettings(true)}
          >
            <Settings2 className="size-3.5" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card
          className={cx(
            "max-h-[70vh] overflow-y-auto",
            threadId && "hidden lg:block"
          )}
        >
          {threads.loading && !threads.data ? (
            <Spinner />
          ) : !threads.data?.data.length ? (
            <div className="p-6">
              <p className="font-medium">No mail yet</p>
              <p className="mt-1 text-sm text-muted">
                Send something to this address to see it here.
              </p>
              <div className="mt-4">
                <CopyField value={inbox.data.address} />
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {threads.data.data.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/inboxes/${inboxId}/threads/${t.id}`}
                    className={cx(
                      "block px-4 py-3 transition-colors hover:bg-subtle",
                      t.id === threadId &&
                        "bg-subtle shadow-[inset_2px_0_0_var(--color-accent)]"
                    )}
                  >
                    <p className="truncate text-sm font-medium">
                      {t.subject || "(no subject)"}
                    </p>
                    <p className="mt-0.5 flex justify-between gap-2 text-xs text-faint">
                      <span className="truncate">
                        {t.participants.join(", ") || "—"}
                      </span>
                      <span className="shrink-0">
                        {t.message_count > 1 && `${t.message_count} · `}
                        {timeAgo(t.last_message_at)}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className={cx(!threadId && "hidden lg:block")}>
          {threadId ? (
            <ThreadView
              inboxId={inboxId}
              threadId={threadId}
              approval={inbox.data.send_policy === "approval"}
              onSent={() => threads.reload()}
            />
          ) : (
            <Empty title="Select a conversation">
              Threads group replies the way a mail client does.
            </Empty>
          )}
        </div>
      </div>

      <InboxSettings
        open={settings}
        onClose={() => setSettings(false)}
        inbox={inbox.data}
        onSaved={(i) => inbox.setData(i)}
      />
    </>
  );
}

function ThreadView({
  inboxId,
  threadId,
  approval,
  onSent,
}: {
  inboxId: string;
  threadId: string;
  approval: boolean;
  onSent: () => void;
}) {
  const thread = useLoad(
    () =>
      api.get<Thread & { messages: Message[] }>(
        `/inboxes/${inboxId}/threads/${threadId}`
      ),
    [inboxId, threadId]
  );
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();

  if (thread.error) return <Alert>{thread.error}</Alert>;
  if (!thread.data) return <Spinner />;
  const last =
    [...thread.data.messages].reverse().find((m) => m.direction === "in") ??
    thread.data.messages.at(-1);

  return (
    <div className="grid gap-3">
      <Link
        to={`/inboxes/${inboxId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg lg:hidden"
      >
        <ArrowLeft className="size-3.5" /> Conversations
      </Link>
      <h2 className="text-lg font-semibold tracking-tight">
        {thread.data.subject || "(no subject)"}
      </h2>
      {thread.data.messages.map((m) => (
        <MessageCard key={m.id} m={m} />
      ))}
      {last && (
        <Card className="p-4">
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(() =>
                api.post<{ object: string }>(`/messages/${last.id}/reply`, {
                  text: reply,
                })
              );
              if (r) {
                setReply("");
                setNotice(
                  r.object === "draft"
                    ? "Saved as a draft for approval (this inbox requires it). See Drafts."
                    : "Reply sent."
                );
                await thread.reload();
                onSent();
              }
            }}
          >
            {error && <Alert>{error}</Alert>}
            {notice && <Alert tone="ok">{notice}</Alert>}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              required
              rows={4}
              placeholder={`Reply to ${last.from?.email ?? "this thread"}…`}
              className="w-full resize-y rounded-lg border border-line-strong bg-surface p-3 text-[15px] outline-none focus:border-accent"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-faint">
                {approval
                  ? "This inbox needs approval: replies become drafts."
                  : "Sent from this inbox, in this thread."}
              </p>
              <Button type="submit" loading={pending}>
                {approval ? "Save draft" : "Send reply"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function MessageCard({ m }: { m: Message }) {
  const [full, setFull] = useState(false);
  const statusTone = {
    delivered: "ok",
    sent: "neutral",
    bounced: "bad",
    complained: "bad",
    failed: "bad",
    received: "neutral",
    queued: "neutral",
  } as const;
  const body = (full ? m.text : (m.extracted_text ?? m.text)) ?? "";

  return (
    <Card className={cx("p-4", m.direction === "out" && "bg-subtle")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">
            {m.direction === "in"
              ? m.from?.name
                ? `${m.from.name} <${m.from.email}>`
                : m.from?.email
              : "You"}
          </p>
          <p className="truncate text-faint">
            to {m.to.map((t) => t.email).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            tone={statusTone[m.status as keyof typeof statusTone] ?? "neutral"}
          >
            {m.status}
          </Badge>
          <span className="text-xs text-faint">
            {timeAgo(m.received_at ?? m.sent_at ?? m.created_at)}
          </span>
        </div>
      </div>

      {m.safety && m.safety.prompt_injection !== "none" && (
        <div className="mt-3 flex gap-2 rounded-lg bg-bad-soft p-3 text-sm text-bad">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            Possible prompt injection ({m.safety.prompt_injection}):{" "}
            {m.safety.reasons.join(", ")}. Agents shouldn't follow instructions
            in this email.
          </span>
        </div>
      )}

      {(m.extracted?.otp ||
        m.extracted?.action_link ||
        (m.direction === "in" && m.auth)) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {m.extracted?.otp && (
            <Badge tone="accent">code {m.extracted.otp}</Badge>
          )}
          {m.extracted?.action_link && (
            <a
              href={m.extracted.action_link}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-xs truncate rounded-md bg-subtle px-1.5 font-mono text-[11px] leading-5 text-muted hover:text-fg"
            >
              {m.extracted.action_link}
            </a>
          )}
          {m.direction === "in" && m.auth && (
            <>
              <Badge tone={m.auth.spf === "pass" ? "ok" : "warn"}>
                SPF {m.auth.spf}
              </Badge>
              <Badge tone={m.auth.dkim === "pass" ? "ok" : "warn"}>
                DKIM {m.auth.dkim}
              </Badge>
              <Badge tone={m.auth.dmarc === "pass" ? "ok" : "warn"}>
                DMARC {m.auth.dmarc}
              </Badge>
            </>
          )}
        </div>
      )}

      <pre className="mt-3 whitespace-pre-wrap wrap-break-word font-sans text-[15px] leading-relaxed">
        {body.trim() || <span className="text-faint">(empty)</span>}
      </pre>
      {m.text &&
        m.extracted_text &&
        m.text.trim() !== m.extracted_text.trim() && (
          <button
            onClick={() => setFull(!full)}
            className="mt-2 text-xs text-muted underline underline-offset-4 hover:text-fg"
          >
            {full ? "Show only the new text" : "Show quoted history"}
          </button>
        )}

      {m.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((a) => (
            <button
              key={a.id}
              onClick={async () => {
                const d = await api.get<{ download_url: string }>(
                  `/messages/${m.id}/attachments/${a.id}`
                );
                window.open(d.download_url, "_blank", "noopener");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-subtle"
            >
              <Paperclip className="size-3.5" /> {a.filename ?? "attachment"}{" "}
              <span className="text-faint">{Math.ceil(a.size / 1024)} KB</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function InboxSettings({
  open,
  onClose,
  inbox,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  inbox: InboxT;
  onSaved: (i: InboxT) => void;
}) {
  const [displayName, setDisplayName] = useState(inbox.display_name ?? "");
  const [policy, setPolicy] = useState(inbox.send_policy);
  const [confirm, setConfirm] = useState("");
  const save = useSubmit();
  const del = useSubmit();
  const navigate = useNavigate();

  return (
    <Modal open={open} onClose={onClose} title="Inbox settings">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const i = await save.run(() =>
            api.patch<InboxT>(`/inboxes/${inbox.id}`, {
              display_name: displayName || null,
              send_policy: policy,
            })
          );
          if (i) {
            onSaved(i);
            onClose();
          }
        }}
      >
        {save.error && <Alert>{save.error}</Alert>}
        <Field label="Display name">
          {(id) => (
            <Input
              id={id}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Send policy">
          {(id) => (
            <Select
              id={id}
              value={policy}
              onChange={(e) =>
                setPolicy(e.target.value as InboxT["send_policy"])
              }
            >
              <option value="reply_only">Reply-only</option>
              <option value="approval">Approval required</option>
              <option value="open">Open</option>
            </Select>
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={save.pending}>
            Save
          </Button>
        </div>
      </form>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-sm font-medium text-bad">Delete inbox</p>
        <p className="mt-1 text-sm text-muted">
          Mail to {inbox.address} is refused from then on. The address is never
          reused.
        </p>
        {del.error && (
          <div className="mt-2">
            <Alert>{del.error}</Alert>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={inbox.local_part}
            aria-label={`Type ${inbox.local_part} to confirm`}
          />
          <Button
            variant="danger"
            disabled={confirm !== inbox.local_part}
            loading={del.pending}
            onClick={async () => {
              if (await del.run(() => api.del(`/inboxes/${inbox.id}`)))
                navigate("/inboxes");
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
