import type { Mailbox } from "@send0/sdk";

/** A list of addresses, e.g. "to dana@acme.com, sam@acme.com". */
export function MailboxList({ label, list }: { label: string; list: Mailbox[] }) {
  if (!list.length) return null;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {label} {list.map((m) => m.email).join(", ")}
    </p>
  );
}
