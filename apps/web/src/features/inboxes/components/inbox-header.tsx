import type { Inbox } from "@send0/sdk";
import { Settings2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { PolicyBadge } from "./policy-badge";

export function InboxHeader({ inbox, onOpenSettings }: { inbox: Inbox; onOpenSettings?: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="truncate font-mono text-lg font-semibold tracking-tight">{inbox.address}</h1>
          <CopyButton value={inbox.address} label="Copy address" />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
          {inbox.display_name && <span>{inbox.display_name}</span>}
          <PolicyBadge policy={inbox.send_policy} />
          <span className="font-mono text-xs">{inbox.id}</span>
        </div>
      </div>
      {onOpenSettings && (
        <Button variant="secondary" onClick={onOpenSettings}>
          <Settings2 />
          Settings
        </Button>
      )}
    </div>
  );
}
