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

/** Settings, Linear-style: its own navigation on the left, one topic at a time on the right. */
export function SettingsLayout() {
  const { workspace } = useCurrentWorkspace();
  return (
    <Page>
      <PageHeader />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings" className="hidden w-52 shrink-0 overflow-y-auto border-r px-3 py-4 md:block">
          {GROUPS(workspace.name).map((g) => (
            <div key={g.label} className="mb-4">
              <p className="truncate px-2 pb-1 text-[11px] font-medium text-faint">{g.label}</p>
              {g.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) =>
                    cn("flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", isActive && "bg-selected text-foreground")
                  }
                >
                  <i.icon className="size-3.5" strokeWidth={1.75} />
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <PageBody>
          <div className="mx-auto w-full max-w-[680px] animate-enter px-5 py-10 md:px-8">
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
    <div className="mb-8 border-b pb-6">
      <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h1>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}
