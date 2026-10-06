import type { Draft } from "@send0/sdk";
import { Link } from "react-router";
import { Avatar, InboxDot } from "@/components/avatar";
import { DetailContent } from "@/components/split-view";
import { DraftBody } from "./draft-body";

/** One draft, the way a reviewer needs it: subject, where it's going, and exactly what it says. */
export function DraftReview({ draft, inboxName }: { draft: Draft; inboxName?: string }) {
  return (
    <DetailContent key={draft.id} className="animate-enter">
      <h2 className="text-[18px] leading-snug font-semibold tracking-[-0.015em] text-balance">{draft.subject || "(no subject)"}</h2>
      <dl className="mt-4 mb-6 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-[13px]">
        <dt className="text-xs text-faint">From</dt>
        <dd className="flex items-center gap-2">
          <InboxDot id={draft.inbox_id} />
          {inboxName ?? draft.inbox_id}
        </dd>
        <dt className="text-xs text-faint">To</dt>
        <dd className="flex flex-wrap gap-1.5">
          {draft.to.map((t) => (
            <span key={t.email} className="inline-flex h-6 items-center gap-1.5 rounded-full border pr-2.5 pl-0.5 text-xs">
              <Avatar name={t.name || t.email} size="sm" />
              {t.email}
            </span>
          ))}
        </dd>
        {draft.cc.length > 0 && (
          <>
            <dt className="text-xs text-faint">Cc</dt>
            <dd className="text-xs">{draft.cc.map((t) => t.email).join(", ")}</dd>
          </>
        )}
      </dl>
      <DraftBody draft={draft} />
      {draft.thread_id && (
        <Link to={`/inboxes/${draft.inbox_id}?thread=${draft.thread_id}`} className="mt-4 inline-block text-xs text-brand hover:underline">
          See the conversation →
        </Link>
      )}
    </DetailContent>
  );
}
