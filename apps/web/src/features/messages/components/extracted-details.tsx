import type { Message } from "@send0/sdk";
import { ExternalLink, KeyRound } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

/** The one-time code and main action link send0 pulled out of the email. */
export function ExtractedDetails({ extracted }: { extracted: Message["extracted"] }) {
  if (!extracted?.otp && !extracted?.action_link) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {extracted.otp && (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-brand/25 bg-brand-soft pr-0.5 pl-2 text-[13px]">
          <KeyRound className="size-3.5 text-brand" />
          <span className="text-muted-foreground">Code</span>
          <span className="font-mono font-semibold tracking-[0.12em] text-foreground">{extracted.otp}</span>
          <CopyButton value={extracted.otp} label="Copy code" />
        </span>
      )}
      {extracted.action_link && (
        <a
          href={extracted.action_link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-elevated px-2 text-[13px] transition-colors hover:bg-hover"
        >
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs">{extracted.action_link}</span>
        </a>
      )}
    </div>
  );
}
