import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useCan } from "@/lib/permissions";
import { memberKeys } from "./keys";

export function useMembers() {
  return useQuery({ queryKey: memberKeys.list(), queryFn: async () => (await authClient.members()).data });
}

/** Open invitations. Only owners and admins can see them. */
export function useInvites() {
  const canManage = useCan("member.manage");
  return useQuery({ queryKey: memberKeys.invites(), queryFn: async () => (await authClient.invites()).data, enabled: canManage });
}
