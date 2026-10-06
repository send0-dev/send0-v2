import { zodResolver } from "@hookform/resolvers/zod";
import { isDraft, type Message } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage, FormRootError } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { mailboxShort } from "@/features/messages/components/mailbox";
import { applyServerError } from "@/lib/form-errors";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useReply } from "../api/use-reply";

const schema = z.object({ text: z.string().trim().min(1, "Write a reply first.").max(500_000) });
type Values = z.infer<typeof schema>;

/** Reply to the latest message in a thread. On approval inboxes it becomes a draft. */
export function ReplyForm({ inboxId, threadId, replyTo, needsApproval }: { inboxId: string; threadId: string; replyTo: Message; needsApproval: boolean }) {
  const reply = useReply(inboxId, threadId);
  const idempotency = useIdempotencyKey();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { text: "" } });
  const recipient = replyTo.direction === "in" ? replyTo.from : replyTo.to[0];

  const onSubmit = form.handleSubmit((v) => {
    if (reply.isPending) return; // ⌘↵ pressed again while sending
    reply.mutate(
      { messageId: replyTo.id, text: v.text, idempotencyKey: idempotency.current() },
      {
        onSuccess: (r) => {
          idempotency.reset();
          form.reset();
          toast.success(isDraft(r) ? "Saved as a draft. It's waiting for approval in Drafts." : "Reply sent");
        },
        // The key is kept, so trying again can't send the same reply twice.
        onError: (e) => applyServerError(form, e),
      }
    );
  });

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border-strong bg-elevated shadow-elevated transition-colors focus-within:border-brand/40"
        noValidate
      >
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem className="gap-0">
              <FormControl>
                <Textarea
                  {...field}
                  id="reply-composer"
                  placeholder={`Reply to ${mailboxShort(recipient)}…`}
                  className="max-h-72 min-h-20 resize-none border-0 bg-transparent px-3.5 pt-3 shadow-none hover:border-0 focus-visible:ring-0 dark:bg-transparent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSubmit();
                    if (e.key === "Escape") e.currentTarget.blur();
                  }}
                />
              </FormControl>
              <FormMessage className="px-3.5 pb-1" />
            </FormItem>
          )}
        />
        <FormRootError className="mx-3 mb-2" />
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
          <p className="text-xs text-faint">{needsApproval ? "Needs approval: this becomes a draft." : "Replies in this thread, from this inbox"}</p>
          <Button variant="primary" type="submit" size="sm" loading={reply.isPending} shortcut="⌘↵">
            {needsApproval ? "Save draft" : "Send"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
