import { Mail } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

/** Nothing open yet: say how to get around. */
export function NoThread() {
  return (
    <div className="dots flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border-strong bg-elevated shadow-elevated">
        <Mail className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[14px] font-medium">No conversation open</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Pick a thread, or move through them from the keyboard.</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>R</Kbd> reply
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>/</Kbd> filter
        </span>
      </div>
    </div>
  );
}
