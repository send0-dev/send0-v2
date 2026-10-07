import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { sessionKeys } from "./keys";

/** Facts about this install: its mail domains and whether sign-up is open. */
export function useInstance() {
  return useQuery({ queryKey: sessionKeys.instance, queryFn: authClient.instance, staleTime: 5 * 60_000 });
}

/** The domain new inboxes get, for labels like "@agents.acme.com". */
export function useMailDomain(): string {
  return useInstance().data?.mail_domains[0] ?? "…";
}
