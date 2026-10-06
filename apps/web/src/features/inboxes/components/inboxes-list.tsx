import type { Inbox } from "@send0/sdk";
import { useNavigate } from "react-router";
import { InboxDot } from "@/components/avatar";
import { CopyButton } from "@/components/copy-button";
import { List, ListColumns, ListRow, RowActions } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { PolicyBadge } from "./policy-badge";

// One width per column, shared by the headings and the cells.
const COL = { name: "w-48 shrink-0 max-md:flex-1", address: "min-w-0 flex-1 max-md:hidden", policy: "w-32 shrink-0 max-sm:w-auto", created: "w-20 shrink-0 text-right max-sm:hidden" };

export function InboxesList({ inboxes, cursor }: { inboxes: Inbox[]; cursor?: string | null }) {
  const navigate = useNavigate();
  return (
    <>
      <ListColumns>
        <span className="w-2.5 shrink-0" />
        <span className={COL.name}>Name</span>
        <span className={COL.address}>Address</span>
        <span className={COL.policy}>Sending</span>
        <span className={COL.created}>Created</span>
      </ListColumns>
      <List>
        {inboxes.map((i) => (
          <ListRow key={i.id} data-nav-id={i.id} selected={cursor === i.id} onClick={() => navigate(`/inboxes/${i.id}`)}>
            <InboxDot id={i.id} className="size-2.5" />
            <span className={`${COL.name} truncate font-medium`}>{i.display_name || i.local_part}</span>
            <span className={`${COL.address} flex items-center gap-1`}>
              <span className="truncate font-mono text-xs text-muted-foreground">{i.address}</span>
              <RowActions>
                <CopyButton value={i.address} label="Copy address" size="icon-xs" />
              </RowActions>
            </span>
            <span className={COL.policy}>
              <PolicyBadge policy={i.send_policy} />
            </span>
            <RelativeTime iso={i.created_at} className={`${COL.created} text-xs text-faint`} />
          </ListRow>
        ))}
      </List>
    </>
  );
}
