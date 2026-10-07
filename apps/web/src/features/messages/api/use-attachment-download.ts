import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage, send0 } from "@/lib/api";

/** Fetches a short-lived download link and opens it. */
export function useAttachmentDownload() {
  return useMutation({
    mutationFn: ({ messageId, attachmentId }: { messageId: string; attachmentId: string }) =>
      send0.messages.attachment(messageId, attachmentId),
    onSuccess: (att) => window.open(att.download_url, "_blank", "noopener"),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Fetches a short-lived link to the original .eml and opens it. */
export function useRawDownload() {
  return useMutation({
    mutationFn: (messageId: string) => send0.messages.rawUrl(messageId),
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
