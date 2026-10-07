import { Settings } from "lucide-react";

export function NotConfigured({ details }: { details: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <Settings className="size-5 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">send0 isn't configured yet</h1>
        <p className="text-[13px] text-muted-foreground">
          The server reported these problems. Fix the variables, deploy again, then reload this page.
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs whitespace-pre-wrap">{details.trim()}</pre>
      </div>
    </main>
  );
}
