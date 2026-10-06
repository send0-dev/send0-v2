import { Separator } from "@/components/ui/separator";
import { SidebarNav, SidebarSecondaryNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** Workspace, navigation and the signed-in person. Used fixed on desktop and in a sheet on phones. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <WorkspaceSwitcher />
      <Separator />
      <SidebarNav onNavigate={onNavigate} />
      <div className="mt-auto grid gap-3">
        <SidebarSecondaryNav onNavigate={onNavigate} />
        <Separator />
        <UserMenu />
      </div>
    </div>
  );
}
