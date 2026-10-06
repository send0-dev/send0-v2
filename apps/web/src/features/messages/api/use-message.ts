import { useQuery } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { messageKeys } from "./keys";

/** One message, including its HTML body. */
export function useMessage(id: string | null) {
  return useQuery({ queryKey: messageKeys.detail(id ?? ""), queryFn: () => send0.messages.get(id!), enabled: !!id });
}
