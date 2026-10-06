import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  timeAgo,
} from "../components/ui";
import { api, type Inbox, type List } from "../lib/api";
import { useSubmit } from "../lib/form";
import { useLoad } from "../lib/useLoad";

export const POLICY_LABEL = {
  open: "Open",
  reply_only: "Reply-only",
  approval: "Approval",
} as const;

export default function Inboxes() {
  const { data, error, loading } = useLoad(() =>
    api.get<List<Inbox>>("/inboxes?limit=100")
  );
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Inboxes"
        description="Each inbox is a real address your agents can receive, wait on and reply from."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New inbox
          </Button>
        }
      />
      {error && <Alert>{error}</Alert>}
      {loading && !data ? (
        <Spinner />
      ) : data && data.data.length === 0 ? (
        <Empty title="No inboxes yet">
          Create one to get an address like agent@send0.email.
        </Empty>
      ) : (
        <Card className="divide-y divide-line">
          {data?.data.map((i) => (
            <Link
              key={i.id}
              to={`/inboxes/${i.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-subtle"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{i.address}</p>
                <p className="text-sm text-faint">
                  {i.display_name ?? "No display name"} · created{" "}
                  {timeAgo(i.created_at)}
                </p>
              </div>
              <Badge tone={i.send_policy === "approval" ? "warn" : "neutral"}>
                {POLICY_LABEL[i.send_policy]}
              </Badge>
            </Link>
          ))}
        </Card>
      )}
      <CreateInbox open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateInbox({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [policy, setPolicy] = useState<Inbox["send_policy"]>("reply_only");
  const { pending, error, fieldErrors, run } = useSubmit();
  const navigate = useNavigate();
  return (
    <Modal open={open} onClose={onClose} title="New inbox">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const inbox = await run(() =>
            api.post<Inbox>("/inboxes", {
              ...(name ? { name: name.toLowerCase() } : {}),
              ...(displayName ? { display_name: displayName } : {}),
              send_policy: policy,
            })
          );
          if (inbox) navigate(`/inboxes/${inbox.id}`);
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field
          label="Address"
          hint="Leave empty for a random address."
          error={fieldErrors.name}
        >
          {(id) => (
            <div className="flex items-center rounded-lg border border-line-strong bg-surface focus-within:border-accent">
              <input
                id={id}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="support-agent"
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none"
              />
              <span className="pr-3 font-mono text-sm text-faint">
                @send0.email
              </span>
            </div>
          )}
        </Field>
        <Field label="Display name" hint="The sender name recipients see.">
          {(id) => (
            <Input
              id={id}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Acme Support"
            />
          )}
        </Field>
        <Field
          label="Send policy"
          hint={
            policy === "approval"
              ? "Every outgoing message waits for approval in Drafts."
              : policy === "reply_only"
                ? "Can only email people who wrote to it first."
                : "Can email anyone (paid plans)."
          }
        >
          {(id) => (
            <Select
              id={id}
              value={policy}
              onChange={(e) =>
                setPolicy(e.target.value as Inbox["send_policy"])
              }
            >
              <option value="reply_only">Reply-only</option>
              <option value="approval">Approval required</option>
              <option value="open">Open</option>
            </Select>
          )}
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Create inbox
          </Button>
        </div>
      </form>
    </Modal>
  );
}
