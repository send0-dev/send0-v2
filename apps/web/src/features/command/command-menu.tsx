import { can } from "@send0/auth/permissions";
import { Inbox, KeyRound, LogOut, Moon, Plus, ShieldCheck, Sun, UserPlus, UserRound, Webhook } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "@/app/theme";
import { InboxDot } from "@/components/avatar";
import { MAIN_NAV, WORKSPACE_NAV, type NavItem } from "@/app/layouts/nav-items";
import { Kbd } from "@/components/ui/kbd";
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

const INBOXES: NavItem = { to: "/inboxes", label: "Inboxes", icon: Inbox, key: "i" };
const ACCOUNT: NavItem[] = [
  { to: "/settings/account", label: "Profile", icon: UserRound },
  { to: "/settings/security", label: "Security", icon: ShieldCheck },
];

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
            {[...MAIN_NAV, INBOXES, ...WORKSPACE_NAV, ...ACCOUNT]
              .filter((i) => !i.requires || can(role, i.requires))
              .map((item) => (
                <CommandItem key={item.to} value={`go ${item.label}`} onSelect={() => run(() => void navigate(item.to))}>
                  <item.icon />
                  {item.label}
                  {item.key && (
                    <span className="ml-auto flex gap-1">
                      <Kbd>G</Kbd>
                      <Kbd>{item.key.toUpperCase()}</Kbd>
                    </span>
                  )}
                </CommandItem>
              ))}
          </CommandGroup>
          {inboxes.items.length > 0 && (
            <CommandGroup heading="Inboxes">
              {inboxes.items.map((i) => (
                <CommandItem key={i.id} value={`inbox ${i.address} ${i.display_name ?? ""}`} onSelect={() => run(() => void navigate(`/inboxes/${i.id}`))}>
                  <InboxDot id={i.id} className="size-2.5" />
                  {i.display_name || i.local_part}
                  <span className="ml-auto font-mono text-xs text-faint">{i.address}</span>
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
