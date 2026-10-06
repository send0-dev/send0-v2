import { Plus } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, CopyField, Empty, Field, Input, Modal, PageHeader, Spinner, timeAgo } from "../components/ui";
import { api, type ApiKey, type Inbox, type List } from "../lib/api";
import { useSubmit } from "../lib/form";
import { useLoad } from "../lib/useLoad";

export default function ApiKeys() {
  const keys = useLoad(() => api.get<List<ApiKey>>("/api-keys?limit=100"));
  const [creating, setCreating] = useState(false);
  const revoke = useSubmit();

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys for your code and agents. Give each agent a key limited to its own inbox."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New key
          </Button>
        }
      />
      {(keys.error || revoke.error) && <Alert>{keys.error ?? revoke.error}</Alert>}
      {keys.loading && !keys.data ? (
        <Spinner />
      ) : !keys.data?.data.length ? (
        <Empty title="No API keys">Create one to call the API from your code.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {keys.data.data.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium">{k.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                  <code className="font-mono">{k.prefix}…</code>
                  {k.scopes.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {k.inbox_ids ? <Badge tone="accent">{k.inbox_ids.length} inbox{k.inbox_ids.length > 1 ? "es" : ""}</Badge> : <Badge>all inboxes</Badge>}
                  <span>· last used {timeAgo(k.last_used_at)}</span>
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`) && revoke.run(() => api.del(`/api-keys/${k.id}`)).then((r) => r && keys.reload())}
              >
                Revoke
              </Button>
            </div>
          ))}
        </Card>
      )}
      <CreateKey open={creating} onClose={() => setCreating(false)} onCreated={keys.reload} />
    </>
  );
}

function CreateKey({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const inboxes = useLoad(() => api.get<List<Inbox>>("/inboxes?limit=100"));
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "send"]);
  const [limit, setLimit] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const { pending, error, fieldErrors, run } = useSubmit();
  const close = () => {
    setCreated(null);
    setName("");
    setLimit([]);
    onClose();
  };
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  return (
    <Modal open={open} onClose={close} title={created ? "Your new key" : "New API key"}>
      {created ? (
        <div className="grid gap-4">
          <CopyField value={created} secret />
          <Alert tone="warn">This is the only time we'll show the full key. Store it somewhere safe.</Alert>
          <Button onClick={close}>Done</Button>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const k = await run(() => api.post<ApiKey>("/api-keys", { name, scopes, ...(limit.length ? { inbox_ids: limit } : {}) }));
            if (k) {
              setCreated(k.key!);
              onCreated();
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Name" error={fieldErrors.name} hint="Where it's used, e.g. “support-agent prod”.">
            {(id) => <Input id={id} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Scopes</legend>
            {[
              ["read", "Read inboxes, messages and threads; wait for mail"],
              ["send", "Create inboxes, send and reply"],
              ["admin", "Everything, including keys, webhooks and approving drafts"],
            ].map(([s, d]) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(s!)} onChange={(e) => setScopes(toggle(scopes, s!, e.target.checked))} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
                <span>
                  <span className="font-mono text-xs">{s}</span> <span className="text-muted">{d}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Limit to inboxes (optional)</legend>
            {inboxes.data?.data.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={limit.includes(i.id)} onChange={(e) => setLimit(toggle(limit, i.id, e.target.checked))} className="size-4 accent-[var(--color-accent)]" />
                {i.address}
              </label>
            ))}
            <p className="text-xs text-faint">{limit.length ? "This key only sees the selected inboxes." : "No limit: the key can use every inbox in this workspace."}</p>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!scopes.length}>
              Create key
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
