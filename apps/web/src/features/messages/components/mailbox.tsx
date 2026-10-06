import type { Mailbox } from "@send0/sdk";

export const mailboxLabel = (m: Mailbox | null | undefined) => (m ? (m.name ? `${m.name} <${m.email}>` : m.email) : "unknown sender");
export const mailboxShort = (m: Mailbox | null | undefined) => m?.name || m?.email || "unknown";

/** A list of addresses, e.g. "to dana@acme.com, sam@acme.com". */
export function MailboxList({ label, list }: { label: string; list: Mailbox[] }) {
  if (!list.length) return null;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {label} {list.map((m) => m.email).join(", ")}
    </p>
  );
}
