import type { Attachment } from "@send0/sdk";
import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { useAttachmentDownload } from "../api/use-attachment-download";

export function AttachmentList({ messageId, attachments }: { messageId: string; attachments: Attachment[] }) {
  const download = useAttachmentDownload();
  const files = attachments.filter((a) => !a.inline);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => download.mutate({ messageId, attachmentId: a.id })}
            disabled={download.isPending && download.variables?.attachmentId === a.id}
            className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] hover:bg-accent disabled:opacity-60"
          >
            <Paperclip className="size-3.5 text-muted-foreground" />
            <span className="max-w-56 truncate">{a.filename ?? "attachment"}</span>
            <span className="tabular text-xs text-muted-foreground">{formatBytes(a.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
