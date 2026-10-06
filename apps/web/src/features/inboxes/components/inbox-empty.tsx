import type { Inbox } from "@send0/sdk";
import { MailOpen } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { EmptyState } from "@/components/empty-state";

/** A brand-new inbox: how to get the first email into it. */
export function InboxEmpty({ inbox }: { inbox: Inbox }) {
  return (
    <EmptyState
      icon={MailOpen}
      title="No mail yet"
      description={
        <div className="grid gap-3">
          <p>Send an email to {inbox.address}. It appears here the moment it arrives. Or wait for it from code:</p>
          <CodeBlock className="text-left" code={`curl "https://api.send0.dev/v1/inboxes/${inbox.id}/messages/wait?timeout=60" \\\n  -H "Authorization: Bearer $SEND0_API_KEY"`} />
        </div>
      }
    />
  );
}
