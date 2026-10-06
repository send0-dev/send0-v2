import { FileCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { errorMessage } from "@/lib/api";
import { useListNavigation } from "@/lib/use-list-navigation";
import { cn } from "@/lib/utils";
import type { DraftStatus } from "../api/keys";
import { useApproveDraft, useRejectDraft } from "../api/use-draft-mutations";
import { useDrafts } from "../api/use-drafts";
import { DraftList } from "../components/draft-list";
import { DraftReview } from "../components/draft-review";
import { EditDraftDialog } from "../components/edit-draft-dialog";

const TABS: { value: DraftStatus; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "sent", label: "Sent" },
  { value: "rejected", label: "Rejected" },
];

/** The approval queue: drafts on the left, the one under review on the right. */
export default function DraftsPage() {
  const [params, setParams] = useSearchParams();
  const status = (TABS.find((t) => t.value === params.get("status"))?.value ?? "pending") as DraftStatus;
  const drafts = useDrafts(status);
  const inboxes = useInboxes();
  const nameOf = useMemo(() => {
    const map = new Map(inboxes.items.map((i) => [i.id, i.display_name || i.local_part]));
    return (id: string) => map.get(id);
  }, [inboxes.items]);
  const [editing, setEditing] = useState(false);

  const ids = drafts.items.map((d) => d.id);
  const selectedId = params.get("draft") ?? ids[0] ?? null;
  const selected = drafts.items.find((d) => d.id === selectedId) ?? null;
  const select = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("draft", id);
        else next.delete("draft");
        return next;
      },
      { replace: true }
    );
  // After a decision, move on to the next draft in the queue.
  const advance = (id: string) => select(ids[ids.indexOf(id) + 1] ?? ids[ids.indexOf(id) - 1] ?? null);
  const approve = useApproveDraft({ onSuccess: (d) => toast.success(`Sent “${d.subject}”`), onError: (e) => toast.error(errorMessage(e)) });
  const reject = useRejectDraft({ onSuccess: () => toast("Draft rejected"), onError: (e) => toast.error(errorMessage(e)) });
  useListNavigation({ ids, current: selectedId, onMove: select, enabled: !editing });

  return (
    <Page>
      <PageHeader>
        <Tabs value={status} onValueChange={(v) => setParams(v === "pending" ? {} : { status: v }, { replace: true })}>
          <TabsList aria-label="Draft status">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>
      <QueryState
        query={drafts.state}
        skeleton={<ListSkeleton />}
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            icon={FileCheck}
            title={status === "pending" ? "You're all caught up" : `No ${status} drafts`}
            description={status === "pending" ? "When an inbox set to “Needs approval” tries to send, the draft waits here, and a draft.created webhook fires." : undefined}
          />
        }
      >
        {(items) => (
          <div className="flex min-h-0 flex-1">
            <section aria-label="Queue" className={cn("w-full min-w-0 overflow-y-auto border-r md:w-[340px] md:shrink-0", params.get("draft") && "max-md:hidden")}>
              <DraftList drafts={items} selectedId={selectedId} onSelect={select} inboxName={nameOf} />
              <LoadMore hasNextPage={drafts.hasNextPage} isFetchingNextPage={drafts.isFetchingNextPage} fetchNextPage={() => void drafts.fetchNextPage()} />
            </section>
            <section aria-label="Review" className={cn("min-w-0 flex-1 overflow-y-auto", !params.get("draft") && "max-md:hidden")}>
              {selected && (
                <DraftReview
                  draft={selected}
                  inboxName={nameOf(selected.inbox_id)}
                  deciding={approve.isPending ? "approve" : reject.isPending ? "reject" : null}
                  onApprove={() => (approve.mutate(selected), advance(selected.id))}
                  onReject={() => (reject.mutate(selected), advance(selected.id))}
                  onEdit={() => setEditing(true)}
                />
              )}
            </section>
          </div>
        )}
      </QueryState>
      <EditDraftDialog draft={editing ? selected : null} onOpenChange={(o) => !o && setEditing(false)} />
    </Page>
  );
}
