import type { Mailbox } from "@send0/sdk";

/** "Dana Rivera <dana@acme.com>", or just the address. */
export const mailboxLabel = (m: Mailbox | null | undefined) => (m ? (m.name ? `${m.name} <${m.email}>` : m.email) : "unknown sender");
/** The name if there is one, else the address. */
export const mailboxShort = (m: Mailbox | null | undefined) => m?.name || m?.email || "unknown";
