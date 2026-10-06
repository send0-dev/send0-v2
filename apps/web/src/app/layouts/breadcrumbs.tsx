import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Link, useMatches } from "react-router";
import type { RouteHandle } from "@/app/router";

/** The route trail from each matched route's `handle.crumb`. The last one is the current page. */
export function Breadcrumbs() {
  const crumbs = useMatches()
    .filter((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .map((m) => ({ id: m.id, to: m.pathname, crumb: (m.handle as RouteHandle).crumb! }));
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
      {crumbs.map(({ id, to, crumb: C }, i) => {
        const last = i === crumbs.length - 1;
        const label = typeof C === "string" ? C : <C />;
        return (
          <Fragment key={id}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" />}
            {last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {label}
              </span>
            ) : (
              <Link to={to} className="truncate rounded px-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
