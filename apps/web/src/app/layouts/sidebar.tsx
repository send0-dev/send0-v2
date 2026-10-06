import { can } from "@send0/auth/permissions";
import { ArrowUpRight, Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { usePendingDraftCount } from "@/features/drafts/api/use-pending-draft-count";
import { useCommandMenu } from "@/features/command/command-menu-context";
import { useMe } from "@/features/session/api/use-me";
import { MAIN_NAV, WORKSPACE_NAV } from "./nav-items";
import { SidebarLink, SidebarSection } from "./nav-link";
import { SidebarInboxes } from "./sidebar-inboxes";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** Workspace, search, navigation, inboxes and the signed-in person. Fixed on desktop, a sheet on phones. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const role = useMe().data?.workspace?.role;
  const pending = usePendingDraftCount();
  const { setOpen } = useCommandMenu();
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-3">
      <div className="grid gap-1.5">
        <WorkspaceSwitcher />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav aria-label="Main" className="grid gap-px">
        {MAIN_NAV.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            end={item.end}
            icon={item.icon}
            onNavigate={onNavigate}
            trailing={item.to === "/drafts" && !!pending && <span className="tabular rounded-full bg-brand-soft px-1.5 text-[11px] font-medium text-brand">{pending}</span>}
          >
            {item.label}
          </SidebarLink>
        ))}
      </nav>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="grid gap-4">
          <SidebarInboxes onNavigate={onNavigate} />
          <SidebarSection label="Workspace">
            <nav aria-label="Workspace" className="grid gap-px">
              {WORKSPACE_NAV.filter((i) => !i.requires || can(role, i.requires)).map((item) => (
                <SidebarLink key={item.to} to={item.to} icon={item.icon} onNavigate={onNavigate}>
                  {item.label}
                </SidebarLink>
              ))}
            </nav>
          </SidebarSection>
        </div>
      </div>

      <div className="grid gap-1">
        <a
          href="https://send0.dev/docs"
          target="_blank"
          rel="noreferrer"
          className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
        >
          <ArrowUpRight className="size-4" strokeWidth={1.75} />
          Documentation
        </a>
        <UserMenu />
      </div>
    </div>
  );
}
