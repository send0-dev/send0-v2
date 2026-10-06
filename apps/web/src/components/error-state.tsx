import { AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toAppError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** A failed load, in place of the content it was for. 403s get their own wording and no retry. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = toAppError(error);
  const forbidden = e.status === 403;
  const Icon = forbidden ? Lock : AlertCircle;
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-1 px-6 py-12 text-center", className)}>
      <Icon className="mb-2 size-5 text-muted-foreground" />
      <p className="font-medium">{forbidden ? "You don't have access to this" : "Couldn't load this"}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{forbidden ? "Ask a workspace owner or admin if you need it." : e.message}</p>
      {!forbidden && onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
