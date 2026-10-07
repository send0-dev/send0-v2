import { Inbox, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { InboxDot } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { CreateInboxDialog } from "@/features/inboxes/components/create-inbox-dialog";
import { PolicyBadge } from "@/features/inboxes/components/policy-badge";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const SHOWN = 6;

/** Quick links to the workspace's inboxes. */
export function InboxesCard({ className }: { className?: string }) {
  const inboxes = useInboxes();
  const canCreate = useCan("inbox.manage");
  const [creating, setCreating] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>Inboxes</CardTitle>
        <Link to="/inboxes" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <div className="flex flex-1 flex-col px-2 pb-2">
        {inboxes.isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="mx-2 my-2.5 h-4" />)}
        {inboxes.items.slice(0, SHOWN).map((i) => (
          <Link
            key={i.id}
            to={`/inboxes/${i.id}`}
            className="flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-hover"
          >
            <InboxDot id={i.id} />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[13px] font-medium">{i.display_name || i.local_part}</span>
              <span className="truncate font-mono text-[11px] text-faint">{i.address}</span>
            </span>
            <PolicyBadge policy={i.send_policy} />
          </Link>
        ))}
        {inboxes.isSuccess && !inboxes.items.length && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
            <Inbox className="size-5 text-faint" strokeWidth={1.75} />
            <p className="text-[13px] text-muted-foreground">No inboxes yet</p>
          </div>
        )}
        {canCreate && (
          <Button variant="ghost" size="sm" className="mt-auto justify-start text-muted-foreground" onClick={() => setCreating(true)}>
            <Plus />
            New inbox
          </Button>
        )}
      </div>
      <CreateInboxDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}
