import type { Draft } from "@send0/sdk";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { RelativeTime } from "@/components/relative-time";
import { PaneBar } from "@/components/split-view";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const KIND = { new: "New message", reply: "Reply", forward: "Forward" } as const;

/** The open draft's bar: back (phones), kind and age, previous/next. */
export function DraftBar({
  draft,
  onPrev,
  onNext,
  onBack,
}: {
  draft: Draft;
  onPrev?: () => void;
  onNext?: () => void;
  onBack: () => void;
}) {
  return (
    <PaneBar>
      <Button variant="ghost" size="icon-sm" className="-ml-2 md:hidden" onClick={onBack} aria-label="Back to drafts">
        <ArrowLeft />
      </Button>
      <span className="font-medium text-foreground">{KIND[draft.kind]}</span>
      <span>·</span>
      {draft.status === "pending" ? (
        <span>
          waiting <RelativeTime iso={draft.created_at} />
        </span>
      ) : (
        <StatusBadge status={draft.status} />
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <Tooltip content="Previous" shortcut="K">
          <Button variant="ghost" size="icon-xs" onClick={onPrev} disabled={!onPrev} aria-label="Previous draft">
            <ChevronUp />
          </Button>
        </Tooltip>
        <Tooltip content="Next" shortcut="J">
          <Button variant="ghost" size="icon-xs" onClick={onNext} disabled={!onNext} aria-label="Next draft">
            <ChevronDown />
          </Button>
        </Tooltip>
      </span>
    </PaneBar>
  );
}
