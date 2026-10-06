import { Plus } from "lucide-react";
import { useState } from "react";
import { InboxDot } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { CreateInboxDialog } from "@/features/inboxes/components/create-inbox-dialog";
import { useCan } from "@/lib/permissions";
import { SidebarLink, SidebarSection } from "./nav-link";

const SHOWN = 8;

/** Every inbox in the workspace as its own sidebar entry, like Linear's teams. */
export function SidebarInboxes({ onNavigate }: { onNavigate?: () => void }) {
  const inboxes = useInboxes();
  const canCreate = useCan("inbox.manage");
  const [creating, setCreating] = useState(false);
  const [all, setAll] = useState(false);
  const items = all ? inboxes.items : inboxes.items.slice(0, SHOWN);
  return (
    <SidebarSection
      label="Inboxes"
      action={
        canCreate && (
          <Tooltip content="New inbox">
            <Button variant="ghost" size="icon-xs" className="size-5" onClick={() => setCreating(true)} aria-label="New inbox">
              <Plus />
            </Button>
          </Tooltip>
        )
      }
    >
      {inboxes.isPending && [0, 1].map((i) => <Skeleton key={i} className="mx-2 my-1.5 h-4" />)}
      {items.map((i) => (
        <SidebarLink key={i.id} to={`/inboxes/${i.id}`} icon={undefined} onNavigate={onNavigate}>
          <span className="flex items-center gap-2">
            <InboxDot id={i.id} />
            <span className="truncate">{i.display_name || i.local_part}</span>
          </span>
        </SidebarLink>
      ))}
      {inboxes.items.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="h-7 cursor-pointer rounded-md px-2 text-left text-xs text-faint hover:bg-hover hover:text-foreground">
          {all ? "Show less" : `${inboxes.items.length - SHOWN} more`}
        </button>
      )}
      <SidebarLink to="/inboxes" end onNavigate={onNavigate}>
        <span className="text-faint group-hover:text-muted-foreground">All inboxes</span>
      </SidebarLink>
      <CreateInboxDialog open={creating} onOpenChange={setCreating} />
    </SidebarSection>
  );
}
