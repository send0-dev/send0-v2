import { ArrowUpRight, Settings } from "lucide-react";
import { NavLink } from "react-router";
import { usePendingDraftCount } from "@/features/drafts/api/use-pending-draft-count";
import { useMe } from "@/features/session/api/use-me";
import { can } from "@send0/auth/permissions";
import { cn } from "@/lib/utils";
import { MAIN_NAV, type NavItem } from "./nav-items";

function NavRow({ item, badge, onNavigate }: { item: NavItem; badge?: number; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          isActive && "bg-accent font-medium text-foreground"
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {!!badge && <span className="tabular rounded-full bg-warning-soft px-1.5 text-[11px] font-medium text-warning">{badge}</span>}
    </NavLink>
  );
}

/** The sidebar's links, filtered to what the member's role can use. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useMe();
  const pending = usePendingDraftCount();
  const role = data?.workspace?.role;
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {MAIN_NAV.filter((i) => !i.requires || can(role, i.requires)).map((item) => (
        <NavRow key={item.to} item={item} badge={item.to === "/drafts" ? pending : undefined} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function SidebarSecondaryNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Settings" className="grid gap-0.5">
      <NavRow item={{ to: "/settings", label: "Settings", icon: Settings }} onNavigate={onNavigate} />
      <a
        href="https://send0.dev/docs"
        target="_blank"
        rel="noreferrer"
        className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowUpRight className="size-4" />
        Docs
      </a>
    </nav>
  );
}
