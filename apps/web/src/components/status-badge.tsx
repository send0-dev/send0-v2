import { StatusIcon } from "@/components/status-icon";
import { cn } from "@/lib/utils";

/** A status glyph with its word, e.g. ✓ delivered. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <StatusIcon status={status} />
      <span className="capitalize">{status.replace(/_/g, " ")}</span>
    </span>
  );
}
