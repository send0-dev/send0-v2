import { ChevronDown, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
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
  PageHeader,
  Spinner,
  cx,
  timeAgo,
} from "../components/ui";
import { api, type Delivery, type List, type Webhook } from "../lib/api";
import { useSubmit } from "../lib/form";
import { useLoad } from "../lib/useLoad";

const EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "draft.created",
  "inbox.suspended",
];

export default function Webhooks() {
  const { data, error, loading, reload } = useLoad(() =>
    api.get<List<Webhook>>("/webhooks?limit=100")
  );
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Webhooks"
        description={
          <>
            Signed POSTs for new mail and delivery events.{" "}
            <a
              className="underline underline-offset-4"
              href="https://send0.dev/docs/realtime/webhooks"
            >
              How to verify them
            </a>
          </>
        }
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add endpoint
          </Button>
        }
      />
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Spinner />
      ) : !data?.data.length ? (
        <Empty title="No webhooks yet">
          Add an HTTPS endpoint to get a POST every time an inbox receives mail.
        </Empty>
      ) : (
        <div className="grid gap-3">
          {data.data.map((w) => (
            <Card key={w.id}>
              <button
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
                onClick={() => setOpen(open === w.id ? null : w.id)}
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{w.url}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {w.events.includes("*")
                      ? "All events"
                      : w.events.join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={w.status === "enabled" ? "ok" : "neutral"}>
                    {w.status}
                  </Badge>
                  <ChevronDown
                    className={cx(
                      "size-4 text-faint transition-transform",
                      open === w.id && "rotate-180"
                    )}
                  />
                </div>
              </button>
              {open === w.id && (
                <WebhookDetail webhook={w} onChanged={reload} />
              )}
            </Card>
          ))}
        </div>
      )}
      <CreateWebhook
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
      />
    </>
  );
}

function WebhookDetail({
  webhook,
  onChanged,
}: {
  webhook: Webhook;
  onChanged: () => void;
}) {
  const deliveries = useLoad(
    () =>
      api.get<List<Delivery>>(`/webhooks/${webhook.id}/deliveries?limit=25`),
    [webhook.id]
  );
  const [note, setNote] = useState<string | null>(null);
  const action = useSubmit();

  return (
    <div className="border-t border-line px-5 py-4">
      {action.error && <Alert>{action.error}</Alert>}
      {note && <Alert tone="ok">{note}</Alert>}
      <div className="mb-4 mt-1 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            action
              .run(() => api.post(`/webhooks/${webhook.id}/test`))
              .then(
                (r) =>
                  r &&
                  (setNote(
                    "Test event sent. It appears below in a few seconds."
                  ),
                  setTimeout(deliveries.reload, 3000))
              )
          }
        >
          <Send className="size-3.5" /> Send test event
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            action
              .run(() =>
                api.patch(`/webhooks/${webhook.id}`, {
                  status: webhook.status === "enabled" ? "disabled" : "enabled",
                })
              )
              .then((r) => r && onChanged())
          }
        >
          {webhook.status === "enabled" ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() =>
            confirm(`Delete the webhook for ${webhook.url}?`) &&
            action
              .run(() => api.del(`/webhooks/${webhook.id}`))
              .then((r) => r && onChanged())
          }
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
      <p className="mb-2 text-sm font-medium">Recent deliveries</p>
      {deliveries.loading && !deliveries.data ? (
        <Spinner />
      ) : !deliveries.data?.data.length ? (
        <p className="text-sm text-faint">No deliveries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="py-1.5 font-medium">Event</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Attempts</th>
                <th className="font-medium">Last result</th>
                <th className="font-medium">When</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {deliveries.data.data.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 font-mono text-xs">{d.event_type}</td>
                  <td>
                    <Badge
                      tone={
                        d.status === "succeeded"
                          ? "ok"
                          : d.status === "failed"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {d.status}
                    </Badge>
                  </td>
                  <td>{d.attempts}</td>
                  <td
                    className="max-w-[220px] truncate text-xs text-muted"
                    title={d.last_error ?? ""}
                  >
                    {d.last_status_code
                      ? `HTTP ${d.last_status_code}`
                      : (d.last_error ?? "—")}
                    {d.last_duration_ms != null && ` · ${d.last_duration_ms}ms`}
                  </td>
                  <td className="text-xs text-faint">
                    {timeAgo(d.created_at)}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        action
                          .run(() =>
                            api.post(
                              `/webhooks/${webhook.id}/deliveries/${d.id}/retry`
                            )
                          )
                          .then(
                            (r) =>
                              r &&
                              (setNote("Delivery queued again."),
                              setTimeout(deliveries.reload, 3000))
                          )
                      }
                    >
                      <RotateCcw className="size-3.5" /> Replay
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateWebhook({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [url, setUrl] = useState("");
  const [all, setAll] = useState(true);
  const [events, setEvents] = useState<string[]>(["message.received"]);
  const [secret, setSecret] = useState<string | null>(null);
  const { pending, error, fieldErrors, run } = useSubmit();
  const close = () => {
    setSecret(null);
    setUrl("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={secret ? "Signing secret" : "Add endpoint"}
    >
      {secret ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            Use this secret to verify the send0-signature header on every
            delivery.
          </p>
          <CopyField value={secret} secret />
          <Alert tone="warn">
            This is the only time it's shown. You can rotate it later.
          </Alert>
          <Button onClick={close}>Done</Button>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const w = await run(() =>
              api.post<Webhook>("/webhooks", {
                url,
                events: all ? ["*"] : events,
              })
            );
            if (w) {
              setSecret(w.secret!);
              onCreated();
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field
            label="Endpoint URL"
            error={fieldErrors.url}
            hint="Must be a public https:// URL."
          >
            {(id) => (
              <Input
                id={id}
                type="url"
                required
                autoFocus
                placeholder="https://example.com/hooks/send0"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />{" "}
              All events
            </label>
            {!all &&
              EVENTS.map((ev) => (
                <label
                  key={ev}
                  className="ml-6 flex items-center gap-2 font-mono text-xs"
                >
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={(e) =>
                      setEvents(
                        e.target.checked
                          ? [...events, ev]
                          : events.filter((x) => x !== ev)
                      )
                    }
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {ev}
                </label>
              ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={!all && !events.length}
            >
              Add endpoint
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
