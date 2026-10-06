import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { usageKeys } from "./keys";

/** Mail per day for the last `days` days, for the overview charts. */
export function useStats(days = 14) {
  return useQuery({ queryKey: usageKeys.stats(days), queryFn: () => send0.usage.stats({ days }) });
}
