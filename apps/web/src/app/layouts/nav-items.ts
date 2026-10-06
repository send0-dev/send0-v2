import { FileClock, KeyRound, LayoutGrid, Mails, Settings, Users, Webhook, type LucideIcon } from "lucide-react";
import type { Action } from "@/lib/permissions";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from roles that can't use the page */
  requires?: Action;
  end?: boolean;
  /** Single key that jumps here after pressing G (Linear-style "g then o") */
  key?: string;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true, key: "o" },
  { to: "/messages", label: "Messages", icon: Mails, key: "m" },
  { to: "/drafts", label: "Drafts", icon: FileClock, key: "d" },
];

export const WORKSPACE_NAV: NavItem[] = [
  { to: "/webhooks", label: "Webhooks", icon: Webhook, requires: "webhook.manage", key: "w" },
  { to: "/api-keys", label: "API keys", icon: KeyRound, requires: "key.manage", key: "k" },
  { to: "/settings/members", label: "Members", icon: Users },
  { to: "/settings/workspace", label: "Settings", icon: Settings, key: "s" },
];
