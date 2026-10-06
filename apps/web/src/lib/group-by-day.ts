const dayFmt = new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" });

/** "Today", "Yesterday", or "Monday, Oct 5" for a timestamp, in the viewer's time zone. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dayFmt.format(d);
}

/** Splits a newest-first list into day groups, keeping order. */
export function groupByDay<T>(items: T[], at: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(at(item));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
