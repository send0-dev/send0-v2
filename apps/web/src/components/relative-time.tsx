import { useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "5 min. ago", refreshed every minute, with the exact time on hover. */
export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span className={cn("text-muted-foreground", className)}>never</span>;
  return (
    <Tooltip content={formatDateTime(iso)}>
      <time dateTime={iso} className={cn("tabular whitespace-nowrap", className)}>
        {relativeTime(iso)}
      </time>
    </Tooltip>
  );
}
