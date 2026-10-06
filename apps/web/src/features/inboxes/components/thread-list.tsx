import type { Thread } from "@send0/sdk";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

/** Conversations in an inbox, most recent first. Rows carry data-nav-id for keyboard navigation. */
export function ThreadList({ threads, selectedId, onSelect, inboxAddress }: { threads: Thread[]; selectedId: string | null; onSelect: (id: string) => void; inboxAddress: string }) {
  return (
    <ul aria-label="Threads" className="flex flex-col">
      {threads.map((t) => {
        const others = t.participants.filter((p) => p.toLowerCase() !== inboxAddress.toLowerCase());
        const who = others[0] ?? inboxAddress;
        const selected = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              data-nav-id={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={selected || undefined}
              className={cn(
                "relative flex w-full min-w-0 cursor-pointer gap-3 border-b border-border/60 px-4 py-3 text-left outline-none transition-colors duration-75 hover:bg-hover focus-visible:bg-hover",
                selected && "bg-selected hover:bg-selected"
              )}
            >
              {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-brand" />}
              <Avatar name={who} size="lg" className="mt-0.5" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{who.split("@")[0]}</span>
                  <RelativeTime iso={t.last_message_at} className="shrink-0 text-[11px] text-faint" />
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] text-muted-foreground">{t.subject || "(no subject)"}</span>
                  {t.message_count > 1 && <span className="tabular shrink-0 rounded-full border border-border-strong px-1.5 text-[10px] leading-4 text-faint">{t.message_count}</span>}
                </span>
                <span className="truncate text-xs text-faint">{others.join(", ") || inboxAddress}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
