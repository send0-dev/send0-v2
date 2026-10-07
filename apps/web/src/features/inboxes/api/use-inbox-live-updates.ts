import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { send0 } from "@/lib/api";
import { draftKeys } from "@/features/drafts/api/keys";
import { messageKeys } from "@/features/messages/api/keys";
import { inboxKeys } from "./keys";

/**
 * Keeps an open inbox current: listens to its live event stream and refreshes threads when
 * mail arrives or a delivery status changes. The SDK reconnects on its own and resumes from the
 * last event, so nothing is missed.
 */
export function useInboxLiveUpdates(inboxId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of send0.events.stream({ inboxId, signal: controller.signal })) {
          if (event.type.startsWith("message.")) {
            void qc.invalidateQueries({ queryKey: inboxKeys.threads(inboxId) });
            const threadId = (event.data as { thread_id?: string }).thread_id;
            if (threadId) void qc.invalidateQueries({ queryKey: inboxKeys.thread(inboxId, threadId) });
            void qc.invalidateQueries({ queryKey: messageKeys.all });
          }
          if (event.type === "draft.created") void qc.invalidateQueries({ queryKey: draftKeys.all });
        }
      } catch {
        // Stream refused (e.g. not available on this server): the page still works, it just won't update live.
      }
    })();
    return () => controller.abort();
  }, [inboxId, qc]);
}
