import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { MESSAGE_STATUSES } from "../statuses";
import type { MessageFilters as Filters } from "../use-message-filters";

const ANY = "any";

/** Search box and dropdowns above the messages table. */
export function MessageFilters({ filters, onChange, onClear, active }: { filters: Filters; onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void; onClear: () => void; active: boolean }) {
  const inboxes = useInboxes();
  const [q, setQ] = useState(filters.q);
  const debounced = useDebouncedValue(q);
  // Apply the search only when the debounced text itself changes, so clearing filters can't
  // re-apply a stale search.
  const applied = useRef(debounced);
  useEffect(() => {
    if (debounced === applied.current) return;
    applied.current = debounced;
    onChange("q", debounced.trim());
  }, [debounced, onChange]);
  useEffect(() => setQ(filters.q), [filters.q]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject and body" className="pl-8" aria-label="Search messages" />
      </div>
      <Select value={filters.direction || ANY} onValueChange={(v) => onChange("direction", v === ANY ? "" : (v as Filters["direction"]))}>
        <SelectTrigger className="w-32" aria-label="Direction">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All mail</SelectItem>
          <SelectItem value="in">Received</SelectItem>
          <SelectItem value="out">Sent</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.status || ANY} onValueChange={(v) => onChange("status", v === ANY ? "" : (v as Filters["status"]))}>
        <SelectTrigger className="w-36" aria-label="Status">
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
        <SelectTrigger className="w-52" aria-label="Inbox">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All inboxes</SelectItem>
          {inboxes.items.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              <span className="font-mono text-xs">{i.address}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
