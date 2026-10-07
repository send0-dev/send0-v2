import { cn } from "@/lib/utils";

type Status =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "pending"
  | "approved"
  | "rejected"
  | "succeeded"
  | "enabled"
  | "disabled"
  | "active"
  | "suspended";

const COLORS: Record<Status, string> = {
  received: "text-muted-foreground",
  queued: "text-faint",
  sent: "text-info",
  delivered: "text-success",
  bounced: "text-destructive",
  complained: "text-destructive",
  failed: "text-destructive",
  pending: "text-warning",
  approved: "text-info",
  rejected: "text-faint",
  succeeded: "text-success",
  enabled: "text-success",
  disabled: "text-faint",
  active: "text-success",
  suspended: "text-destructive",
};

/** 14px status glyphs in the spirit of Linear's issue states: rings, partial rings and filled marks. */
export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const s = (status in COLORS ? status : "received") as Status;
  const cls = cn("size-3.5 shrink-0", COLORS[s], className);
  const ring = <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />;
  switch (s) {
    case "queued":
    case "pending":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.3" />
        </svg>
      );
    case "sent":
    case "approved":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          {ring}
          <path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
        </svg>
      );
    case "delivered":
    case "succeeded":
    case "enabled":
    case "active":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path
            d="M4.3 7.2 6.1 9l3.6-3.8"
            fill="none"
            stroke="var(--panel)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bounced":
    case "complained":
    case "failed":
    case "suspended":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="m4.9 4.9 4.2 4.2m0-4.2L4.9 9.1" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "rejected":
    case "disabled":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          {ring}
          <path d="M4.5 7h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          {ring}
          <circle cx="7" cy="7" r="2.25" fill="currentColor" />
        </svg>
      );
  }
}
