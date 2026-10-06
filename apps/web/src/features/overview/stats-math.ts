import type { Stats } from "@send0/sdk";

type Key = keyof Stats["totals"];

/** Sum of `key` over the last `n` days. */
export const lastDays = (s: Stats, key: Key, n: number) => s.days.slice(-n).reduce((t, d) => t + d[key], 0);

/** Percent change of the last 7 days against the 7 before them; null when there's nothing to compare. */
export function weekOverWeek(s: Stats, key: Key): number | null {
  const recent = lastDays(s, key, 7);
  const before = s.days.slice(-14, -7).reduce((t, d) => t + d[key], 0);
  if (!before) return null;
  return Math.round(((recent - before) / before) * 100);
}

/**
 * Share of mail with a delivery report that was delivered, as a whole percent. Null until the
 * first report comes back (delivered or bounced), so a fresh send doesn't read as 0%.
 */
export function deliveryRate(s: Stats): number | null {
  const reported = s.totals.delivered + s.totals.bounced;
  return reported ? Math.round((s.totals.delivered / reported) * 100) : null;
}
