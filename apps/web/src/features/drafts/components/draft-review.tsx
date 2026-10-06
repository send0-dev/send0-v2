import type { Draft } from "@send0/sdk";
import { Pencil } from "lucide-react";
import { Link } from "react-router";
import { Avatar, InboxDot } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";
import { DraftBody } from "./draft-body";

const KIND = { new: "New message", reply: "Reply", forward: "Forward" } as const;

/**
 * One draft, the way a reviewer needs it: where it's going, what it says (HTML included), and
 * the decision, with A / E / X shortcuts.
 */
export function DraftReview({
  draft,
  inboxName,
  onApprove,
  onReject,
  onEdit,
  deciding,
}: {
  draft: Draft;
  inboxName?: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  deciding: "approve" | "reject" | null;
}) {
  const canDecide = useCan("draft.decide");
  const canEdit = useCan("draft.edit");
  const pending = draft.status === "pending";
  const live = pending && canDecide && !deciding;
  useHotkeys({ a: () => live && onApprove(), x: () => live && onReject(), e: () => live && canEdit && onEdit() }, live);

  return (
    <div className="flex min-h-full animate-enter flex-col" key={draft.id}>
      <div className="flex-1 px-5 pt-6 pb-4 md:px-8">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{KIND[draft.kind]}</Badge>
          {!pending && <StatusBadge status={draft.status} />}
          <span className="text-xs text-faint">
            created <RelativeTime iso={draft.created_at} />
          </span>
        </div>
        <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.015em] text-balance">{draft.subject || "(no subject)"}</h2>
        <dl className="mt-4 grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-faint">From</dt>
          <dd className="flex items-center gap-1.5">
            <InboxDot id={draft.inbox_id} />
            {inboxName ?? draft.inbox_id}
          </dd>
          <dt className="text-faint">To</dt>
          <dd className="flex flex-wrap gap-1.5">
            {draft.to.map((t) => (
              <span key={t.email} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs">
                <Avatar name={t.name || t.email} size="xs" />
                {t.email}
              </span>
            ))}
          </dd>
          {draft.cc.length > 0 && (
            <>
              <dt className="text-faint">Cc</dt>
              <dd className="text-xs">{draft.cc.map((t) => t.email).join(", ")}</dd>
            </>
          )}
        </dl>
        <div className="mt-6">
          <DraftBody draft={draft} />
        </div>
        {draft.thread_id && (
          <Link to={`/inboxes/${draft.inbox_id}?thread=${draft.thread_id}`} className="mt-4 inline-block text-xs text-brand hover:underline">
            See the conversation →
          </Link>
        )}
      </div>
      {pending && canDecide && (
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-panel/95 px-5 py-3 backdrop-blur md:px-8">
          <p className="text-xs text-faint max-sm:hidden">Nothing is sent until you approve it.</p>
          <div className="ml-auto flex gap-2">
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={onEdit} shortcut="E" disabled={!!deciding}>
                <Pencil />
                Edit
              </Button>
            )}
            <Button size="sm" onClick={onReject} loading={deciding === "reject"} disabled={!!deciding} shortcut="X">
              Reject
            </Button>
            <Button variant="primary" size="sm" onClick={onApprove} loading={deciding === "approve"} disabled={!!deciding} shortcut="A">
              Approve & send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
