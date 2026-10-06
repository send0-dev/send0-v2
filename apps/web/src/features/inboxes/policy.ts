import type { Inbox } from "@send0/sdk";

export type SendPolicy = Inbox["send_policy"];

export const SEND_POLICIES: Record<SendPolicy, { label: string; description: string }> = {
  reply_only: { label: "Reply only", description: "Can only write to people who emailed it first." },
  approval: { label: "Needs approval", description: "Outgoing mail waits as a draft until a person approves it." },
  open: { label: "Open", description: "Can write to anyone (paid plans)." },
};
