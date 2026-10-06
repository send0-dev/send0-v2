import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PaneBar } from "@/components/split-view";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/** The open thread's bar: back (phones), position in the list, previous/next, copy id. */
export function ThreadBar({ threadId, index, total, onPrev, onNext, onBack }: { threadId: string; index: number; total: number; onPrev?: () => void; onNext?: () => void; onBack: () => void }) {
  return (
    <PaneBar>
      <Button variant="ghost" size="icon-sm" className="-ml-2 md:hidden" onClick={onBack} aria-label="Back to threads">
        <ArrowLeft />
      </Button>
      {index >= 0 && (
        <span className="tabular">
          {index + 1} of {total}
        </span>
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <Tooltip content="Previous" shortcut="K">
          <Button variant="ghost" size="icon-xs" onClick={onPrev} disabled={!onPrev} aria-label="Previous thread">
            <ChevronUp />
          </Button>
        </Tooltip>
        <Tooltip content="Next" shortcut="J">
          <Button variant="ghost" size="icon-xs" onClick={onNext} disabled={!onNext} aria-label="Next thread">
            <ChevronDown />
          </Button>
        </Tooltip>
        <CopyButton value={threadId} label="Copy thread id" size="icon-xs" />
      </span>
    </PaneBar>
  );
}
