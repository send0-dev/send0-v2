import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

/** Shown in place of a route that crashed or doesn't exist. The rest of the app keeps working. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-mono text-xs text-muted-foreground">{notFound ? "404" : "Error"}</p>
      <h1 className="text-lg font-semibold">{notFound ? "This page doesn't exist" : "Something broke on this page"}</h1>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        {notFound ? "Check the address, or head back to the overview." : "Reload to try again. If it keeps happening, email support@send0.dev."}
      </p>
      <div className="mt-3 flex gap-2">
        {!notFound && (
          <Button variant="secondary" onClick={() => location.reload()}>
            Reload
          </Button>
        )}
        <Button asChild>
          <Link to="/">Go to overview</Link>
        </Button>
      </div>
    </div>
  );
}

/** Unknown paths inside the app. */
export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">This page doesn't exist</h1>
      <p className="max-w-sm text-[13px] text-muted-foreground">Check the address, or head back to the overview.</p>
      <Button asChild className="mt-3">
        <Link to="/">Go to overview</Link>
      </Button>
    </div>
  );
}
