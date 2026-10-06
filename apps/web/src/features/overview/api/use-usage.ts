import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { usageKeys } from "./keys";

export function useUsage() {
  return useQuery({ queryKey: usageKeys.all, queryFn: () => send0.usage.get() });
}
