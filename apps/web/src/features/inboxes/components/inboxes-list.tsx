import type { Inbox } from "@send0/sdk";
import { useNavigate } from "react-router";
import { InboxDot } from "@/components/avatar";
import { CopyButton } from "@/components/copy-button";
import { List, ListRow, RowActions } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { PolicyBadge } from "./policy-badge";

export function InboxesList({ inboxes, cursor }: { inboxes: Inbox[]; cursor?: string | null }) {
  const navigate = useNavigate();
  return (
    <List>
      {inboxes.map((i) => (
        <ListRow key={i.id} data-nav-id={i.id} selected={cursor === i.id} onClick={() => navigate(`/inboxes/${i.id}`)}>
          <InboxDot id={i.id} className="size-2.5" />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate font-medium">{i.display_name || i.local_part}</span>
            <span className="truncate font-mono text-xs text-faint">{i.address}</span>
          </span>
          <RowActions>
            <CopyButton value={i.address} label="Copy address" size="icon-xs" />
          </RowActions>
          <PolicyBadge policy={i.send_policy} />
          <RelativeTime iso={i.created_at} className="w-20 shrink-0 text-right text-xs text-faint max-sm:hidden" />
        </ListRow>
      ))}
    </List>
  );
}
