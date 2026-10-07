import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { ErrorState } from "@/components/error-state";
import { FullPageSpinner } from "@/app/layouts/full-page-spinner";
import { useMe } from "@/features/session/api/use-me";
import { STAGE_HOME, stageOf, type Stage } from "@/features/session/stage";

const isSafePath = (p: string | null): p is string => !!p && p.startsWith("/") && !p.startsWith("//");

/**
 * Lets a route render only at the allowed stages; anyone else is sent where they belong.
 * The page they asked for travels along as ?next=, so they land there after logging in.
 */
export function RequireStage({ allow }: { allow: Stage[] }) {
  const me = useMe();
  const location = useLocation();
  const [params] = useSearchParams();
  if (me.isPending) return <FullPageSpinner />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} className="min-h-dvh" />;

  const stage = stageOf(me.data);
  if (allow.includes(stage)) return <Outlet />;

  const next = params.get("next");
  if (stage === "ready" && isSafePath(next)) return <Navigate to={next} replace />;
  const here = location.pathname + location.search;
  const target = STAGE_HOME[stage];
  const keepNext =
    stage === "anonymous" && here !== "/"
      ? `?next=${encodeURIComponent(here)}`
      : next && isSafePath(next)
        ? `?next=${encodeURIComponent(next)}`
        : "";
  return <Navigate to={target + keepNext} replace />;
}
