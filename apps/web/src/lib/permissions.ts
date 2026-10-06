import { can, type Action } from "@send0/auth/permissions";
import { useMe } from "@/features/session/api/use-me";

export type { Action, Role } from "@send0/auth/permissions";

/** Whether the signed-in member may do `action` in the current workspace. The server enforces the same table. */
export function useCan(action: Action): boolean {
  const { data } = useMe();
  return can(data?.workspace?.role, action);
}
