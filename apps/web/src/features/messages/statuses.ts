export const MESSAGE_STATUSES = ["received", "queued", "sent", "delivered", "bounced", "complained", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
