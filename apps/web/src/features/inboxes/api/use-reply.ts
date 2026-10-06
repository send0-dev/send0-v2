import { isDraft, type ReplyParams } from "@send0/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { send0 } from "@/lib/api";
import { draftKeys } from "@/features/drafts/api/keys";
import { messageKeys } from "@/features/messages/api/keys";
import { usageKeys } from "@/features/overview/api/keys";
import { inboxKeys } from "./keys";

/** Replies in-thread. On approval inboxes the result is a draft instead of a sent message. */
export function useReply(inboxId: string, threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, idempotencyKey, ...params }: ReplyParams & { messageId: string; idempotencyKey: string }) =>
      send0.messages.reply(messageId, params, { idempotencyKey }),
    onSuccess: (result) => {
      if (isDraft(result)) return void qc.invalidateQueries({ queryKey: draftKeys.all });
      void qc.invalidateQueries({ queryKey: inboxKeys.thread(inboxId, threadId) });
      void qc.invalidateQueries({ queryKey: inboxKeys.threads(inboxId) });
      void qc.invalidateQueries({ queryKey: messageKeys.all });
      void qc.invalidateQueries({ queryKey: usageKeys.all });
    },
  });
}
