import type { Draft } from "@send0/sdk";
import { InboxDot } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { StatusIcon } from "@/components/status-icon";
import { cn } from "@/lib/utils";

/** The queue: one row per draft, newest first. */
export function DraftList({ drafts, selectedId, onSelect, inboxName }: { drafts: Draft[]; selectedId: string | null; onSelect: (id: string) => void; inboxName: (id: string) => string | undefined }) {
  return (
    <ul aria-label="Drafts" className="flex flex-col">
      {drafts.map((d) => {
        const selected = d.id === selectedId;
        return (
          <li key={d.id}>
            <button
              type="button"
              data-nav-id={d.id}
              onClick={() => onSelect(d.id)}
              aria-current={selected || undefined}
              className={cn(
                "relative grid w-full cursor-pointer gap-1 border-b border-border/60 px-4 py-3 text-left outline-none transition-colors duration-75 hover:bg-hover focus-visible:bg-hover",
                selected && "bg-selected hover:bg-selected"
              )}
            >
              {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-brand" />}
              <span className="flex min-w-0 items-center gap-2">
                <StatusIcon status={d.status} />
                <span className="truncate text-[13px] font-medium">{d.subject || "(no subject)"}</span>
                <RelativeTime iso={d.created_at} className="ml-auto shrink-0 text-[11px] text-faint" />
              </span>
              <span className="flex min-w-0 items-center gap-1.5 pl-[22px] text-xs text-muted-foreground">
                <InboxDot id={d.inbox_id} />
                <span className="truncate">{inboxName(d.inbox_id) ?? "inbox"}</span>
                <span className="text-faint">→</span>
                <span className="truncate">{d.to.map((t) => t.email).join(", ")}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
