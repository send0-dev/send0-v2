import type { Thread } from "@send0/sdk";
import { Avatar } from "@/components/avatar";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

/** Who to show for a thread: the newest message's sender, else the first other participant. */
export function threadSender(t: Thread, inboxAddress: string, inboxName: string): { name: string; key: string } {
  const latest = t.latest_message;
  if (latest?.direction === "out") return { name: inboxName, key: inboxAddress };
  if (latest?.from) return { name: latest.from.name || latest.from.email.split("@")[0]!, key: latest.from.email };
  const other = t.participants.find((p) => p.toLowerCase() !== inboxAddress.toLowerCase()) ?? inboxAddress;
  return { name: other.split("@")[0]!, key: other };
}

/** Conversations in an inbox, most recent first: sender, subject, preview. Rows carry data-nav-id for J/K. */
export function ThreadList({ threads, selectedId, onSelect, inboxAddress, inboxName }: { threads: Thread[]; selectedId: string | null; onSelect: (id: string) => void; inboxAddress: string; inboxName: string }) {
  return (
    <ul aria-label="Threads" className="flex flex-col">
      {threads.map((t) => {
        const sender = threadSender(t, inboxAddress, inboxName);
        const selected = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              data-nav-id={t.id}
              onClick={() => onSelect(t.id)}
              aria-current={selected || undefined}
              className={cn(
                "relative grid w-full min-w-0 cursor-pointer grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-b border-border/60 px-gutter py-3 text-left outline-none transition-colors duration-75 hover:bg-hover focus-visible:bg-hover",
                selected && "bg-selected hover:bg-selected"
              )}
            >
              {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-brand" />}
              <Avatar name={sender.name} size="lg" className="mt-px size-7" />
              <span className="grid min-w-0 gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{sender.name}</span>
                  {t.message_count > 1 && <span className="tabular shrink-0 text-[11px] text-faint">{t.message_count}</span>}
                  <RelativeTime iso={t.last_message_at} className="ml-auto shrink-0 text-[11px] text-faint" />
                </span>
                <span className="truncate text-[13px] text-foreground/85">{t.subject || "(no subject)"}</span>
                <span className="truncate text-xs text-faint">{t.latest_message?.snippet || "No text"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
