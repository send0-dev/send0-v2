import { can } from "@send0/auth/permissions";
import { Inbox, KeyRound, LogOut, Moon, Plus, Sun, UserPlus, Webhook } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "@/app/theme";
import { MAIN_NAV, SETTINGS_NAV } from "@/app/layouts/nav-items";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { CreateApiKeyDialog } from "@/features/api-keys/components/create-api-key-dialog";
import { CreateInboxDialog } from "@/features/inboxes/components/create-inbox-dialog";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { useMe } from "@/features/session/api/use-me";
import { useLogOut } from "@/features/session/api/use-session-actions";
import { CreateWebhookDialog } from "@/features/webhooks/components/create-webhook-dialog";
import { useCommandMenu } from "./command-menu-context";

type Dialog = "inbox" | "key" | "webhook" | "invite" | null;

/** ⌘K: jump to any page or inbox, or start a common action, from the keyboard. */
export function CommandMenu() {
  const { open, setOpen } = useCommandMenu();
  const navigate = useNavigate();
  const role = useMe().data?.workspace?.role;
  const inboxes = useInboxes({ enabled: open });
  const { resolved, setChoice } = useTheme();
  const logOut = useLogOut();
  const [dialog, setDialog] = useState<Dialog>(null);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, inboxes and actions…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Go to">
            {[...MAIN_NAV, ...SETTINGS_NAV]
              .filter((i) => !i.requires || can(role, i.requires))
              .map((item) => (
                <CommandItem key={item.to} value={`go ${item.label}`} onSelect={() => run(() => navigate(item.to))}>
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
          </CommandGroup>
          {inboxes.items.length > 0 && (
            <CommandGroup heading="Inboxes">
              {inboxes.items.map((i) => (
                <CommandItem key={i.id} value={`inbox ${i.address} ${i.display_name ?? ""}`} onSelect={() => run(() => navigate(`/inboxes/${i.id}`))}>
                  <Inbox />
                  <span className="font-mono text-xs">{i.address}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {can(role, "inbox.manage") && (
              <CommandItem value="create new inbox" onSelect={() => run(() => setDialog("inbox"))}>
                <Plus />
                Create inbox
              </CommandItem>
            )}
            {can(role, "key.manage") && (
              <CommandItem value="create new api key" onSelect={() => run(() => setDialog("key"))}>
                <KeyRound />
                Create API key
              </CommandItem>
            )}
            {can(role, "webhook.manage") && (
              <CommandItem value="add webhook endpoint" onSelect={() => run(() => setDialog("webhook"))}>
                <Webhook />
                Add webhook
              </CommandItem>
            )}
            {can(role, "member.manage") && (
              <CommandItem value="invite teammate member" onSelect={() => run(() => setDialog("invite"))}>
                <UserPlus />
                Invite teammate
              </CommandItem>
            )}
            <CommandItem value="toggle theme dark light" onSelect={() => run(() => setChoice(resolved === "dark" ? "light" : "dark"))}>
              {resolved === "dark" ? <Sun /> : <Moon />}
              Switch to {resolved === "dark" ? "light" : "dark"} theme
            </CommandItem>
            <CommandItem value="log out sign out" onSelect={() => run(() => logOut.mutate())}>
              <LogOut />
              Log out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <CreateInboxDialog open={dialog === "inbox"} onOpenChange={(o) => !o && setDialog(null)} />
      <CreateApiKeyDialog open={dialog === "key"} onOpenChange={(o) => !o && setDialog(null)} />
      <CreateWebhookDialog open={dialog === "webhook"} onOpenChange={(o) => !o && setDialog(null)} />
      <InviteMemberDialog open={dialog === "invite"} onOpenChange={(o) => !o && setDialog(null)} />
    </>
  );
}
