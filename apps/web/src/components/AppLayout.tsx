import { BookOpen, FileClock, Inbox, KeyRound, LogOut, Moon, Settings, Sun, Webhook } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { http } from "../lib/api";
import { useSession } from "../lib/session";
import { Logo, cx } from "./ui";

const NAV = [
  { to: "/inboxes", label: "Inboxes", icon: Inbox },
  { to: "/drafts", label: "Drafts", icon: FileClock },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/api-keys", label: "API keys", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("send0-theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-5">
          <Logo />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cx(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive ? "bg-subtle font-medium text-fg shadow-[inset_2px_0_0_var(--color-accent)]" : "text-muted hover:bg-subtle hover:text-fg",
                )
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
          <a href="https://send0.dev/docs/" className="flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-subtle hover:text-fg">
            <BookOpen className="size-4" />
            Docs
          </a>
        </nav>
        <div className="mt-auto hidden border-t border-line p-3 md:block">
          <p className="truncate px-2.5 text-sm font-medium">{me?.name ?? me?.email}</p>
          <p className="truncate px-2.5 text-xs text-faint">{me?.email}</p>
          <div className="mt-2 flex gap-1">
            <button onClick={toggleTheme} className="flex-1 rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Toggle theme">
              {dark ? <Sun className="mx-auto size-4" /> : <Moon className="mx-auto size-4" />}
            </button>
            <button
              onClick={async () => {
                await http.post("/auth/logout");
                await refresh();
                navigate("/login");
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg p-2 text-sm text-muted hover:bg-subtle hover:text-fg"
            >
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
