import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useCommandMenu } from "@/features/command/command-menu-context";
import { Breadcrumbs } from "./breadcrumbs";

/** Breadcrumbs and search. On phones, also the button that opens the sidebar. */
export function TopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { setOpen } = useCommandMenu();
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenSidebar} aria-label="Open menu">
        <Menu />
      </Button>
      <Breadcrumbs />
      <Button variant="secondary" size="sm" className="ml-auto w-9 justify-start gap-2 text-muted-foreground sm:w-56" onClick={() => setOpen(true)}>
        <Search className="size-3.5" />
        <span className="hidden flex-1 text-left sm:inline">Search or jump to…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>
    </header>
  );
}
