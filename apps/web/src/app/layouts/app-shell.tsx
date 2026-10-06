import { useState } from "react";
import { Outlet } from "react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandMenu } from "@/features/command/command-menu";
import { CommandMenuProvider } from "@/features/command/command-menu-context";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** The signed-in app: sidebar, top bar, the page, and the ⌘K menu. */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <CommandMenuProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar md:block">
          <Sidebar />
        </aside>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenSidebar={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandMenu />
    </CommandMenuProvider>
  );
}
