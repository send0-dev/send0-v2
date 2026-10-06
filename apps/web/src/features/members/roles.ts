import type { Role } from "@/lib/permissions";

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including deleting the workspace." },
  admin: { label: "Admin", description: "Manage inboxes, keys, webhooks and members." },
  member: { label: "Member", description: "Read and reply to mail, approve drafts." },
};
