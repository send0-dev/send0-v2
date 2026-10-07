import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InboxDot } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { MESSAGE_STATUSES } from "../statuses";
import type { MessageFilters as Filters } from "../use-message-filters";

const ANY = "any";

/** Search and the status / inbox pickers above the messages list. Direction lives in the header. */
export function MessageFilters({ filters, onChange, onClear, active }: { filters: Filters; onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void; onClear: () => void; active: boolean }) {
  const inboxes = useInboxes();
  const [q, setQ] = useState(filters.q);
  // Follow the URL when it changes from outside (Clear filters, back/forward).
  const [urlQ, setUrlQ] = useState(filters.q);
  if (filters.q !== urlQ) {
    setUrlQ(filters.q);
    setQ(filters.q);
  }
  const debounced = useDebouncedValue(q);
  // Apply the search only when the debounced text itself changes, so clearing filters can't
  // re-apply a stale search.
  const applied = useRef(debounced);
  useEffect(() => {
    if (debounced === applied.current) return;
    applied.current = debounced;
    onChange("q", debounced.trim());
  }, [debounced, onChange]);

  return (
    <>
      <div className="relative min-w-48 flex-1 max-md:basis-full">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
        <input
          id="message-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          placeholder="Search subject and body"
          aria-label="Search messages"
          className="h-7 w-full rounded-md bg-transparent pr-2 pl-7 text-[13px] outline-none placeholder:text-faint hover:bg-hover focus:bg-hover"
        />
      </div>
      <Select value={filters.status || ANY} onValueChange={(v) => onChange("status", v === ANY ? "" : (v as Filters["status"]))}>
        <SelectTrigger className="h-7 w-auto gap-1.5 border-dashed text-xs max-md:flex-1" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {MESSAGE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.inbox || ANY} onValueChange={(v) => onChange("inbox", v === ANY ? "" : v)}>
        <SelectTrigger className="h-7 w-auto max-w-56 gap-1.5 border-dashed text-xs max-md:max-w-none max-md:flex-1" aria-label="Inbox">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All inboxes</SelectItem>
          {inboxes.items.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              <span className="flex items-center gap-2">
                <InboxDot id={i.id} />
                {i.display_name || i.local_part}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active && (
        <Button variant="ghost" size="xs" onClick={onClear}>
          <X />
          Clear
        </Button>
      )}
    </>
  );
}
