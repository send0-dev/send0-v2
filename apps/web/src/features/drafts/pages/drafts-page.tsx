import type { Draft } from "@send0/sdk";
import { FileCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import type { DraftStatus } from "../api/keys";
import { useDrafts } from "../api/use-drafts";
import { DraftCard } from "../components/draft-card";
import { EditDraftDialog } from "../components/edit-draft-dialog";

const TABS: { value: DraftStatus; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "sent", label: "Sent" },
  { value: "rejected", label: "Rejected" },
];

/** Mail from approval inboxes, waiting for a person. */
export default function DraftsPage() {
  const [params, setParams] = useSearchParams();
  const status = (TABS.find((t) => t.value === params.get("status"))?.value ?? "pending") as DraftStatus;
  const drafts = useDrafts(status);
  const inboxes = useInboxes();
  const [editing, setEditing] = useState<Draft | null>(null);
  const addressOf = useMemo(() => new Map(inboxes.items.map((i) => [i.id, i.address])), [inboxes.items]);

  return (
    <>
      <PageHeader title="Drafts" description="Inboxes set to “Needs approval” hold outgoing mail here until someone approves it." />
      <Tabs value={status} onValueChange={(v) => setParams(v === "pending" ? {} : { status: v }, { replace: true })} className="mb-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <QueryState
        query={drafts.state}
        skeleton={
          <div className="grid gap-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        }
        isEmpty={(items) => items.length === 0}
        empty={
          <Card>
            <EmptyState
              icon={FileCheck}
              title={status === "pending" ? "Nothing waiting for approval" : `No ${status} drafts`}
              description={status === "pending" ? "When an approval inbox tries to send, the draft shows up here and in a draft.created webhook." : undefined}
            />
          </Card>
        }
      >
        {(items) => (
          <div className="grid gap-3">
            {items.map((d) => (
              <DraftCard key={d.id} draft={d} inboxAddress={addressOf.get(d.inbox_id)} onEdit={setEditing} />
            ))}
            <LoadMore hasNextPage={drafts.hasNextPage} isFetchingNextPage={drafts.isFetchingNextPage} fetchNextPage={() => void drafts.fetchNextPage()} />
          </div>
        )}
      </QueryState>
      <EditDraftDialog draft={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  );
}
