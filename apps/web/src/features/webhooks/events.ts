import type { CreateWebhookParams } from "@send0/sdk";

export type WebhookEventType = Exclude<NonNullable<CreateWebhookParams["events"]>[number], "*">;

/** Webhook event types, with what each one means. */
export const WEBHOOK_EVENTS: readonly { type: WebhookEventType; description: string }[] = [
  { type: "message.received", description: "An inbox got mail" },
  { type: "message.sent", description: "An inbox sent mail" },
  { type: "message.delivered", description: "The receiving server accepted it" },
  { type: "message.bounced", description: "It bounced" },
  { type: "message.complained", description: "The recipient marked it as spam" },
  { type: "draft.created", description: "Mail is waiting for approval" },
  { type: "inbox.suspended", description: "Sending was paused" },
];

export const EVENT_TYPES = WEBHOOK_EVENTS.map((e) => e.type) as [WebhookEventType, ...WebhookEventType[]];
