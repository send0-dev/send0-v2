import type { Inbox } from "@send0/sdk";
import { MailOpen } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { CopyField } from "@/components/copy-field";

/** A brand-new inbox: how to get the first email into it. */
export function InboxEmpty({ inbox }: { inbox: Inbox }) {
  return (
    <div className="grid animate-enter gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg border border-border-strong bg-elevated">
          <MailOpen className="size-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[13px] font-medium">Waiting for mail</p>
          <p className="text-xs text-muted-foreground">New mail appears here the moment it lands.</p>
        </div>
      </div>
      <CopyField value={inbox.address} label="Copy address" />
      <p className="text-xs text-muted-foreground">Or wait for it from code:</p>
      <CodeBlock code={`curl "https://api.send0.dev/v1/inboxes/${inbox.id}/messages/wait?timeout=60" \\\n  -H "Authorization: Bearer $SEND0_API_KEY"`} />
    </div>
  );
}
