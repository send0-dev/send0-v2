import { FileClock } from "lucide-react";
import { Link } from "react-router";
import { usePendingDraftCount } from "@/features/drafts/api/use-pending-draft-count";
import { pluralize } from "@/lib/format";

/** A nudge when mail is waiting for someone to approve it. */
export function PendingDraftsBanner() {
  const count = usePendingDraftCount();
  if (!count) return null;
  return (
    <Link
      to="/drafts"
      className="group flex items-center gap-3 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] transition-colors hover:border-warning/40"
    >
      <FileClock className="size-4 text-warning" />
      <span className="flex-1">
        <span className="font-medium">{pluralize(count, "draft")} waiting for approval.</span>{" "}
        <span className="text-muted-foreground">Agents can't send them until someone reviews.</span>
      </span>
      <span className="text-xs font-medium text-warning transition-transform group-hover:translate-x-0.5">Review →</span>
    </Link>
  );
}
