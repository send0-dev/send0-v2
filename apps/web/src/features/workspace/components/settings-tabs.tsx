import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/settings/workspace", label: "Workspace" },
  { to: "/settings/members", label: "Members" },
  { to: "/settings/account", label: "Account" },
];

/** Tabs across the settings pages. */
export function SettingsTabs() {
  return (
    <nav aria-label="Settings" className="mb-6 flex gap-4 border-b">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            cn("-mb-px border-b-2 border-transparent pb-2 text-[13px] font-medium text-muted-foreground hover:text-foreground", isActive && "border-foreground text-foreground")
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
