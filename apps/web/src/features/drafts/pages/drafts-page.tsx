import { FileCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { Page, PageHeader } from "@/components/page";
import { QueryState } from "@/components/query-state";
import { DetailPane, ListPane, PaneBar, SplitView } from "@/components/split-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { errorMessage } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { useListNavigation } from "@/lib/use-list-navigation";
import type { DraftStatus } from "../api/keys";
import { useApproveDraft, useRejectDraft } from "../api/use-draft-mutations";
import { useDrafts } from "../api/use-drafts";
import { DraftActions } from "../components/draft-actions";
import { DraftBar } from "../components/draft-bar";
import { DraftList } from "../components/draft-list";
import { DraftReview } from "../components/draft-review";
import { EditDraftDialog } from "../components/edit-draft-dialog";

const TABS: { value: DraftStatus; label: string; noun: string }[] = [
  { value: "pending", label: "Waiting", noun: "waiting" },
  { value: "sent", label: "Sent", noun: "sent" },
  { value: "rejected", label: "Rejected", noun: "rejected" },
];

/** The approval queue: drafts on the left, the one under review on the right. */
export default function DraftsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.value === params.get("status")) ?? TABS[0]!;
  const status = tab.value;
  const drafts = useDrafts(status);
  const inboxes = useInboxes();
  const nameOf = useMemo(() => {
    const map = new Map(inboxes.items.map((i) => [i.id, i.display_name || i.local_part]));
    return (id: string) => map.get(id);
  }, [inboxes.items]);
  const [editing, setEditing] = useState(false);

  const ids = drafts.items.map((d) => d.id);
  const explicit = params.get("draft");
  // On desktop the first draft opens on its own; on phones only an explicit pick opens one.
  const selectedId = explicit ?? ids[0] ?? null;
  const selected = drafts.items.find((d) => d.id === selectedId) ?? null;
  const index = selected ? ids.indexOf(selected.id) : -1;
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
            title={status === "pending" ? "You're all caught up" : `No ${tab.noun} drafts`}
            description={status === "pending" ? "When an inbox set to “Needs approval” tries to send, the draft waits here, and a draft.created webhook fires." : undefined}
          />
        }
      >
        {(items) => (
          <SplitView detailOpen={!!explicit}>
            <ListPane label="Queue" bar={<PaneBar className="tabular">{pluralize(items.length, `${tab.noun} draft`)}</PaneBar>}>
              <DraftList drafts={items} selectedId={selectedId} onSelect={select} inboxName={nameOf} />
              <LoadMore hasNextPage={drafts.hasNextPage} isFetchingNextPage={drafts.isFetchingNextPage} fetchNextPage={() => void drafts.fetchNextPage()} />
            </ListPane>
            <DetailPane
              label="Review"
              bar={
                selected && (
                  <DraftBar
                    draft={selected}
                    onPrev={index > 0 ? () => select(ids[index - 1]!) : undefined}
                    onNext={index >= 0 && index < ids.length - 1 ? () => select(ids[index + 1]!) : undefined}
                    onBack={() => select(null)}
                  />
                )
              }
              footer={
                selected?.status === "pending" && (
                  <DraftActions
                    deciding={approve.isPending ? "approve" : reject.isPending ? "reject" : null}
                    onApprove={() => (approve.mutate(selected), advance(selected.id))}
                    onReject={() => (reject.mutate(selected), advance(selected.id))}
                    onEdit={() => setEditing(true)}
                  />
                )
              }
            >
              {selected && <DraftReview draft={selected} inboxName={nameOf(selected.inbox_id)} />}
            </DetailPane>
          </SplitView>
        )}
      </QueryState>
      <EditDraftDialog draft={editing ? selected : null} onOpenChange={(o) => !o && setEditing(false)} />
    </Page>
  );
}
