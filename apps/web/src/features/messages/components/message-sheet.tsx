import { Download } from "lucide-react";
import { Link } from "react-router";
import { Avatar } from "@/components/avatar";
import { QueryState } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessage } from "../api/use-message";
import { useRawDownload } from "../api/use-attachment-download";
import { AttachmentList } from "./attachment-list";
import { AuthBadges } from "./auth-badges";
import { mailboxShort } from "../mailbox-names";
import { ExtractedDetails } from "./extracted-details";
import { HtmlPreview } from "./html-preview";
import { MessageDetails } from "./message-details";
import { SafetyAlert } from "./safety-alert";

/** A message's full view: text, HTML, technical details and the original file. */
export function MessageSheet({ messageId, onOpenChange }: { messageId: string | null; onOpenChange: (open: boolean) => void }) {
  const message = useMessage(messageId);
  const raw = useRawDownload();
  return (
    <Sheet open={!!messageId} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {!message.data && <SheetTitle className="sr-only">Message</SheetTitle>}
        <QueryState
          query={message}
          skeleton={
            <div className="grid gap-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          {(m) => (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{m.subject || "(no subject)"}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={m.status} />
                    <span className="flex items-center gap-1.5 text-xs">
                      <Avatar name={mailboxShort(m.from)} size="xs" />
                      {mailboxShort(m.from)}
                    </span>
                    <Link to={`/inboxes/${m.inbox_id}?thread=${m.thread_id}`} className="text-xs text-brand hover:underline">
                      Open thread →
                    </Link>
                  </div>
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-4">
                <SafetyAlert safety={m.safety} />
                <div className="flex flex-wrap gap-2">
                  <ExtractedDetails extracted={m.extracted} />
                  <AuthBadges auth={m.auth} />
                </div>
                <Tabs defaultValue="text">
                  <TabsList>
                    <TabsTrigger value="text">Text</TabsTrigger>
                    {m.html && <TabsTrigger value="html">HTML</TabsTrigger>}
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="text">
                    <div className="rounded-lg border bg-card p-4 text-[13.5px] leading-[1.65] break-words whitespace-pre-wrap">{m.text ?? <span className="text-muted-foreground italic">No text body</span>}</div>
                  </TabsContent>
                  {m.html && (
                    <TabsContent value="html">
                      <HtmlPreview html={m.html} />
                    </TabsContent>
                  )}
                  <TabsContent value="details">
                    <MessageDetails message={m} />
                  </TabsContent>
                </Tabs>
                <AttachmentList messageId={m.id} attachments={m.attachments} />
                <div>
                  <Button variant="secondary" size="sm" loading={raw.isPending} onClick={() => raw.mutate(m.id)}>
                    <Download />
                    Original (.eml)
                  </Button>
                </div>
              </SheetBody>
            </>
          )}
        </QueryState>
      </SheetContent>
    </Sheet>
  );
}
