import type { ApiKey } from "@send0/sdk";
import { KeyRound, MoreHorizontal } from "lucide-react";
import { List, ListRow, RowActions } from "@/components/list";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pluralize } from "@/lib/format";
import { ACCESS_LEVELS, accessLevelOf } from "../access";

export function ApiKeysList({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (key: ApiKey) => void }) {
  return (
    <List>
      {keys.map((k) => {
        const level = accessLevelOf(k.scopes);
        return (
          <ListRow key={k.id}>
            <KeyRound className="size-3.5 shrink-0 text-faint" />
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-medium">{k.name}</span>
              <span className="truncate font-mono text-xs text-faint">{k.prefix}…</span>
            </span>
            <Badge variant={level === "admin" ? "warning" : "neutral"}>{ACCESS_LEVELS[level].label}</Badge>
            <span className="w-24 shrink-0 text-xs text-muted-foreground max-md:hidden">{k.inbox_ids ? pluralize(k.inbox_ids.length, "inbox", "inboxes") : "All inboxes"}</span>
            <span className="w-28 shrink-0 text-right text-xs text-faint max-sm:hidden">
              {k.last_used_at ? (
                <>
                  used <RelativeTime iso={k.last_used_at} />
                </>
              ) : (
                "never used"
              )}
            </span>
            <RowActions className="opacity-100">
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
            </RowActions>
          </ListRow>
        );
      })}
    </List>
  );
}
