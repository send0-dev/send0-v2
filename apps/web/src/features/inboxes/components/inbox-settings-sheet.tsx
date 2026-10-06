import type { Inbox } from "@send0/sdk";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InboxSettingsForm } from "../forms/inbox-settings-form";
import { DeleteInboxSection } from "./delete-inbox-section";

export function InboxSettingsSheet({ inbox, open, onOpenChange }: { inbox: Inbox; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Inbox settings</SheetTitle>
          <SheetDescription className="font-mono text-xs">{inbox.address}</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid content-start gap-6">
          <InboxSettingsForm inbox={inbox} onSaved={() => onOpenChange(false)} />
          <Separator />
          <DeleteInboxSection inbox={inbox} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
