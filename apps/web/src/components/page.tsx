import { Menu } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Breadcrumbs } from "@/app/layouts/breadcrumbs";
import { useShell } from "@/app/layouts/shell-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The frame every page uses inside the app's panel: a 48px header (breadcrumbs, then the page's
 * own controls and actions), and a scrolling body.
 */
export function Page({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex h-full min-h-0 flex-col", className)} {...props} />;
}

export function PageHeader({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  const { openSidebar } = useShell();
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-3 border-b px-4 md:px-5", className)}>
      <Button variant="ghost" size="icon-sm" className="-ml-1 md:hidden" onClick={openSidebar} aria-label="Open menu">
        <Menu />
      </Button>
      <Breadcrumbs />
      {children && <div className="flex min-w-0 items-center gap-2">{children}</div>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A secondary bar under the header for filters and view controls. */
export function PageToolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 md:px-5", className)} {...props} />;
}

export function PageBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto", className)} {...props} />;
}

/** Centered column for document-like pages (overview, settings). */
export function PageContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-5xl animate-enter px-5 py-8 md:px-8", className)} {...props} />;
}

/** Big title + one line of context at the top of a document-like page. */
export function PageTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A small heading above a block of content. */
export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2.5 flex items-center justify-between gap-2", className)}>
      <h2 className="text-xs font-medium text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}
