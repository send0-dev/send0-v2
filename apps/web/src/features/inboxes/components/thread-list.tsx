import type { Thread } from "@send0/sdk";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

/** Conversations in an inbox, most recent first. */
export function ThreadList({ threads, selectedId, onSelect, inboxAddress }: { threads: Thread[]; selectedId: string | null; onSelect: (id: string) => void; inboxAddress: string }) {
  return (
    <ul className="divide-y" aria-label="Threads">
      {threads.map((t) => {
        const others = t.participants.filter((p) => p.toLowerCase() !== inboxAddress.toLowerCase());
        const selected = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={selected || undefined}
              className={cn(
                "grid w-full min-w-0 cursor-pointer gap-0.5 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
                selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)]"
              )}
            >
              <span className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium">{t.subject || "(no subject)"}</span>
                <RelativeTime iso={t.last_message_at} className="shrink-0 text-xs text-muted-foreground" />
              </span>
              <span className="flex min-w-0 items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{others.join(", ") || inboxAddress}</span>
                {t.message_count > 1 && <span className="tabular shrink-0">{t.message_count}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
