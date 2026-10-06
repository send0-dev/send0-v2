import { FileClock, Inbox, KeyRound, LayoutDashboard, Mail, Settings, Users, Webhook, type LucideIcon } from "lucide-react";
import type { Action } from "@/lib/permissions";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from roles that can't use the page */
  requires?: Action;
  end?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/inboxes", label: "Inboxes", icon: Inbox },
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/drafts", label: "Drafts", icon: FileClock },
  { to: "/webhooks", label: "Webhooks", icon: Webhook, requires: "webhook.manage" },
  { to: "/api-keys", label: "API keys", icon: KeyRound, requires: "key.manage" },
];

export const SETTINGS_NAV: NavItem[] = [
  { to: "/settings/workspace", label: "Workspace", icon: Settings },
  { to: "/settings/members", label: "Members", icon: Users },
  { to: "/settings/account", label: "Account", icon: Settings },
];
