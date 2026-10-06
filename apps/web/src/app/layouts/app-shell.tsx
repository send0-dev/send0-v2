import { useState } from "react";
import { Outlet } from "react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandMenu } from "@/features/command/command-menu";
import { CommandMenuProvider } from "@/features/command/command-menu-context";
import { useGoToShortcuts } from "./go-to-shortcuts";
import { ShellContext } from "./shell-context";
import { Sidebar } from "./sidebar";

/** The signed-in app: the sidebar on the canvas, and the page in a raised panel beside it. */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  useGoToShortcuts();
  return (
    <CommandMenuProvider>
      <ShellContext.Provider value={{ openSidebar: () => setMobileOpen(true) }}>
        <div className="flex h-dvh overflow-hidden bg-canvas">
          <aside className="hidden w-[232px] shrink-0 md:block">
            <Sidebar />
          </aside>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[260px] bg-canvas p-0" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <main className="min-w-0 flex-1 overflow-hidden bg-panel md:my-2 md:mr-2 md:rounded-xl md:shadow-panel">
            <Outlet />
          </main>
        </div>
        <CommandMenu />
      </ShellContext.Provider>
    </CommandMenuProvider>
  );
}
