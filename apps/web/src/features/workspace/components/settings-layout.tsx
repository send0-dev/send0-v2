import { Building2, ShieldCheck, UserRound, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { Page, PageBody, PageHeader } from "@/components/page";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { cn } from "@/lib/utils";

const GROUPS = (workspace: string) => [
  {
    label: workspace,
    items: [
      { to: "/settings/workspace", label: "General", icon: Building2 },
      { to: "/settings/members", label: "Members", icon: Users },
    ],
  },
  {
    label: "My account",
    items: [
      { to: "/settings/account", label: "Profile", icon: UserRound },
      { to: "/settings/security", label: "Security", icon: ShieldCheck },
    ],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", isActive && "bg-selected text-foreground");

/**
 * Settings, Linear-style: its own navigation on the left (tabs across the top on phones), one
 * topic at a time on the right, left-aligned next to the navigation.
 */
export function SettingsLayout() {
  const { workspace } = useCurrentWorkspace();
  const groups = GROUPS(workspace.name);
  return (
    <Page>
      <PageHeader />
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b px-gutter py-2 md:hidden">
        {groups.flatMap((g) => g.items).map((i) => (
          <NavLink key={i.to} to={i.to} className={linkClass}>
            {i.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings" className="hidden w-52 shrink-0 overflow-y-auto border-r px-3 py-4 md:block">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="truncate px-2 pb-1 text-[11px] font-medium text-faint">{g.label}</p>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} className={linkClass}>
                  <i.icon className="size-3.5" strokeWidth={1.75} />
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <PageBody>
          <div className="w-full max-w-[720px] animate-enter px-gutter py-8">
            <Outlet />
          </div>
        </PageBody>
      </div>
    </Page>
  );
}

/** The title at the top of a settings page. */
export function SettingsTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">{title}</h1>
      {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
