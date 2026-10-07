import type { ApiKey } from "@send0/sdk";
import { KeyRound, MoreHorizontal } from "lucide-react";
import { List, ListColumns, ListRow } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pluralize } from "@/lib/format";
import { ACCESS_LEVELS, accessLevelOf } from "../access";

const COL = {
  name: "min-w-0 flex-1",
  key: "w-36 shrink-0 max-lg:hidden",
  access: "w-32 shrink-0",
  inboxes: "w-24 shrink-0 max-md:hidden",
  used: "w-24 shrink-0 text-right max-sm:hidden",
  actions: "w-6 shrink-0",
};

export function ApiKeysList({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (key: ApiKey) => void }) {
  return (
    <>
      <ListColumns>
        <span className="w-3.5 shrink-0" />
        <span className={COL.name}>Name</span>
        <span className={COL.key}>Key</span>
        <span className={COL.access}>Access</span>
        <span className={COL.inboxes}>Inboxes</span>
        <span className={COL.used}>Last used</span>
        <span className={COL.actions} />
      </ListColumns>
      <List>
        {keys.map((k) => {
          const level = accessLevelOf(k.scopes);
          return (
            <ListRow key={k.id}>
              <KeyRound className="size-3.5 shrink-0 text-faint" />
              <span className={`${COL.name} truncate font-medium`}>{k.name}</span>
              <span className={`${COL.key} truncate font-mono text-xs text-faint`}>{k.prefix}…</span>
              <span className={COL.access}>
                <Badge variant={level === "admin" ? "warning" : "neutral"}>{ACCESS_LEVELS[level].label}</Badge>
              </span>
              <span className={`${COL.inboxes} text-xs text-muted-foreground`}>
                {k.inbox_ids ? pluralize(k.inbox_ids.length, "inbox", "inboxes") : "All"}
              </span>
              <span className={`${COL.used} text-xs text-faint`}>{k.last_used_at ? <RelativeTime iso={k.last_used_at} /> : "Never"}</span>
              <span className={COL.actions}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${k.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent opensDialogs align="end">
                    <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(k)}>
                      Revoke key
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </ListRow>
          );
        })}
      </List>
    </>
  );
}
