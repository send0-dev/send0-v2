import { FileClock } from "lucide-react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { usePendingDraftCount } from "@/features/drafts/api/use-pending-draft-count";
import { pluralize } from "@/lib/format";

/** A nudge when mail is waiting for someone to approve it. */
export function PendingDraftsCard() {
  const count = usePendingDraftCount();
  if (!count) return null;
  return (
    <Card className="border-warning/30 bg-warning-soft/50">
      <Link to="/drafts" className="flex items-center gap-3 px-5 py-4">
        <FileClock className="size-5 text-warning" />
        <span className="flex-1 text-[13px]">
          <span className="font-medium">{pluralize(count, "draft")} waiting for approval.</span> <span className="text-muted-foreground">Review them before they go out.</span>
        </span>
        <span className="text-[13px] font-medium">Review →</span>
      </Link>
    </Card>
  );
}
