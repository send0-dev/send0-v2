import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, PageHeader, Spinner, timeAgo } from "../components/ui";
import { api, type Draft, type Inbox, type List } from "../lib/api";
import { useLoad } from "../lib/useLoad";

export default function Drafts() {
  const { data, error, loading, reload } = useLoad(async () => {
    const inboxes = (await api.get<List<Inbox>>("/inboxes?limit=100")).data;
    const lists = await Promise.all(inboxes.map((i) => api.get<List<Draft>>(`/inboxes/${i.id}/drafts?status=pending&limit=100`)));
    const byId = Object.fromEntries(inboxes.map((i) => [i.id, i]));
    return lists.flatMap((l) => l.data).map((d) => ({ ...d, inbox: byId[d.inbox_id]! })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const act = async (d: Draft, action: "send" | "reject") => {
    setBusy(d.id);
    setMessage(null);
    try {
      await api.post(`/drafts/${d.id}/${action}`);
      setMessage({ tone: "ok", text: action === "send" ? `Sent "${d.subject}".` : `Rejected "${d.subject}".` });
      await reload();
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Drafts" description="Messages from inboxes set to “approval”, waiting for a person to send or reject them." />
      {error && <Alert>{error}</Alert>}
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty title="Nothing waiting for approval">Set an inbox's send policy to “Approval required” and its outgoing mail will appear here first.</Empty>
      ) : (
        <div className="grid gap-3">
          {data.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{d.subject}</p>
                  <p className="text-sm text-muted">
                    {d.inbox.address} → {d.to.map((t) => t.email).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{d.kind}</Badge>
                  <span className="text-xs text-faint">{timeAgo(d.created_at)}</span>
                </div>
              </div>
              <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-subtle p-3 font-sans text-sm">{d.text}</pre>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" size="sm" disabled={busy === d.id} onClick={() => act(d, "reject")}>
                  Reject
                </Button>
                <Button size="sm" loading={busy === d.id} onClick={() => act(d, "send")}>
                  Approve & send
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
