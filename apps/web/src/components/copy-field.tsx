import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/** A read-only value in monospace with a copy button, e.g. an address or an id. */
export function CopyField({ value, className, label }: { value: string; className?: string; label?: string }) {
  return (
    <div className={cn("flex h-8 min-w-0 items-center gap-1 rounded-md border bg-muted/50 pr-0.5 pl-2.5", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{value}</code>
      <CopyButton value={value} label={label ?? "Copy"} />
    </div>
  );
}
