import type { Draft } from "@send0/sdk";
import { Pencil } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { useApproveDraft, useRejectDraft } from "../api/use-draft-mutations";
import { DraftBody } from "./draft-body";

const KIND = { new: "New message", reply: "Reply", forward: "Forward" } as const;

/** A draft as a reviewer sees it: where it's going, what it says, and approve or reject. */
export function DraftCard({ draft, inboxAddress, onEdit }: { draft: Draft; inboxAddress?: string; onEdit: (d: Draft) => void }) {
  const approve = useApproveDraft({ onSuccess: () => toast.success("Approved and sent"), onError: (e) => toast.error(errorMessage(e)) });
  const reject = useRejectDraft({ onSuccess: () => toast("Draft rejected"), onError: (e) => toast.error(errorMessage(e)) });
  const canDecide = useCan("draft.decide");
  const canEdit = useCan("draft.edit");
  const pending = draft.status === "pending";
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{draft.subject || "(no subject)"}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            <span className="font-mono text-xs">{inboxAddress ?? draft.inbox_id}</span> → {draft.to.map((t) => t.email).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{KIND[draft.kind]}</Badge>
          {!pending && <StatusBadge status={draft.status} />}
          <RelativeTime iso={draft.decided_at ?? draft.created_at} className="text-xs text-muted-foreground" />
        </div>
      </div>
      <div className="mx-5 my-3">
        <DraftBody draft={draft} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        {draft.thread_id ? (
          <Link to={`/inboxes/${draft.inbox_id}?thread=${draft.thread_id}`} className="text-[13px] text-muted-foreground hover:text-foreground">
            View thread
          </Link>
        ) : (
          <span />
        )}
        {pending && canDecide && (
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(draft)}>
                <Pencil />
                Edit
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={approve.isPending}
              loading={reject.isPending}
              onClick={() => reject.mutate(draft)}
            >
              Reject
            </Button>
            <Button
              size="sm"
              disabled={reject.isPending}
              loading={approve.isPending}
              onClick={() => approve.mutate(draft)}
            >
              Approve & send
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
