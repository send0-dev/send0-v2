import { useApiKeys } from "@/features/api-keys/api/use-api-keys";
import { useMembers } from "@/features/members/api/use-members";
import { useMessages } from "@/features/messages/api/use-messages";
import { useWebhooks } from "@/features/webhooks/api/use-webhooks";
import { useCan } from "@/lib/permissions";
import type { ChecklistItem } from "../components/setup-checklist";
import { useUsage } from "./use-usage";

/**
 * The getting-started checklist, worked out from what exists. Admin-only steps (keys, webhooks,
 * invites) are left out for members. Returns null until everything it needs has loaded.
 */
export function useChecklist(): ChecklistItem[] | null {
  const isAdmin = useCan("key.manage");
  const usage = useUsage();
  const received = useMessages({ direction: "in", limit: 1 });
  const keys = useApiKeys({ enabled: isAdmin });
  const hooks = useWebhooks({ enabled: isAdmin });
  const members = useMembers();
  const loading = usage.isPending || received.isPending || (isAdmin && (keys.isPending || hooks.isPending || members.isPending));
  if (loading) return null;
  const items: (ChecklistItem | false)[] = [
    { label: "Create an inbox", done: (usage.data?.inboxes.used ?? 0) > 0, to: "/inboxes" },
    { label: "Receive your first email", done: received.items.length > 0, to: "/inboxes" },
    isAdmin && { label: "Create an API key", done: keys.items.length > 0, to: "/api-keys" },
    isAdmin && { label: "Add a webhook", done: hooks.items.length > 0, to: "/webhooks" },
    isAdmin && { label: "Invite a teammate", done: (members.data?.length ?? 0) > 1, to: "/settings/members" },
  ];
  return items.filter(Boolean) as ChecklistItem[];
}
