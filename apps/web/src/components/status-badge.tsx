import { Badge, type BadgeVariant } from "@/components/ui/badge";

const TONES: Record<string, BadgeVariant> = {
  // messages
  received: "neutral",
  queued: "neutral",
  sent: "info",
  delivered: "success",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  // drafts
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  // webhooks and deliveries
  enabled: "success",
  disabled: "neutral",
  succeeded: "success",
  // inboxes
  active: "success",
  suspended: "destructive",
};

/** A status word in the colour that matches its meaning. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={TONES[status] ?? "neutral"} className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
