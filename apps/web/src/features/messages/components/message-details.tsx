import type { Message } from "@send0/sdk";
import { CopyField } from "@/components/copy-field";
import { formatBytes, formatDateTime } from "@/lib/format";
import { mailboxLabel } from "./mailbox";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** The technical facts about a message: ids, headers, authentication, size. */
export function MessageDetails({ message: m }: { message: Message }) {
  return (
    <dl className="divide-y">
      <Row label="Message id">
        <CopyField value={m.id} />
      </Row>
      <Row label="Thread">
        <span className="font-mono text-xs">{m.thread_id}</span>
      </Row>
      <Row label="From">{mailboxLabel(m.from)}</Row>
      <Row label="To">{m.to.map(mailboxLabel).join(", ") || "—"}</Row>
      {m.cc.length > 0 && <Row label="Cc">{m.cc.map(mailboxLabel).join(", ")}</Row>}
      {m.reply_to.length > 0 && <Row label="Reply-To">{m.reply_to.map(mailboxLabel).join(", ")}</Row>}
      <Row label="Date">{formatDateTime(m.received_at ?? m.sent_at ?? m.created_at)}</Row>
      {m.rfc_message_id && (
        <Row label="Message-ID">
          <span className="font-mono text-xs">{m.rfc_message_id}</span>
        </Row>
      )}
      {m.in_reply_to.length > 0 && (
        <Row label="In-Reply-To">
          <span className="font-mono text-xs">{m.in_reply_to.join(" ")}</span>
        </Row>
      )}
      {m.auth && <Row label="Auth">{`SPF ${m.auth.spf} · DKIM ${m.auth.dkim} · DMARC ${m.auth.dmarc}`}</Row>}
      {m.tag && <Row label="Tag">{m.tag}</Row>}
      <Row label="Size">{formatBytes(m.size)}</Row>
    </dl>
  );
}
