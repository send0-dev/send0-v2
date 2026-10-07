import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

/** One sidebar row: icon, label, optional trailing count. */
export function SidebarLink({
  to,
  end,
  icon: Icon,
  children,
  trailing,
  onNavigate,
}: {
  to: string;
  end?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
  trailing?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-75 hover:bg-hover hover:text-foreground",
          isActive && "bg-selected text-foreground",
        )
      }
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </NavLink>
  );
}

/** A collapsible-looking group label in the sidebar ("Inboxes", "Workspace"). */
export function SidebarSection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-px">
      <div className="flex h-7 items-center justify-between px-2">
        <span className="text-[11px] font-medium text-faint">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}
