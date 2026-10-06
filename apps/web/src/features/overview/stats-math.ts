import type { Stats } from "@send0/sdk";

type Key = keyof Stats["totals"];

/** Sum of `key` over the last `n` days. */
export const lastDays = (s: Stats, key: Key, n: number) => s.days.slice(-n).reduce((t, d) => t + d[key], 0);

/**
 * Percent change of the second half of the range against the first half (e.g. this week vs last
 * week for 14 days); null when the first half had nothing to compare against.
 */
export function halfOverHalf(s: Stats, key: Key): number | null {
  const half = Math.floor(s.days.length / 2);
  const recent = lastDays(s, key, half);
  const before = s.days.slice(-2 * half, -half).reduce((t, d) => t + d[key], 0);
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
