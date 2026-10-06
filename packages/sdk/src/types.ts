import type { components, operations } from "./generated/openapi";

type Schemas = components["schemas"];
type Body<Op extends keyof operations> = operations[Op] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type Query<Op extends keyof operations> = operations[Op] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

export type Inbox = Schemas["Inbox"];
export type Message = Schemas["Message"];
export type Thread = Schemas["Thread"];
export type ThreadWithMessages = Schemas["ThreadWithMessages"];
export type Attachment = Schemas["Attachment"];
export type AttachmentDownload = Schemas["AttachmentDownload"];
export type Draft = Schemas["Draft"];
export type Webhook = Schemas["Webhook"];
export type WebhookWithSecret = Schemas["WebhookWithSecret"];
export type Delivery = Schemas["Delivery"];
export type ApiKey = Schemas["ApiKey"];
export type ApiKeyWithSecret = Schemas["ApiKeyWithSecret"];
export type Event = Schemas["Event"];
export type Mailbox = Schemas["Mailbox"];
export type WaitResult = Schemas["WaitResult"];
export type Usage = Schemas["Usage"];

export type CreateInboxParams = Body<"createInbox">;
export type UpdateInboxParams = Body<"updateInbox">;
export type SendMessageParams = Body<"sendMessage">;
export type ReplyParams = Body<"replyToMessage">;
export type ForwardParams = Body<"forwardMessage">;
export type CreateWebhookParams = Body<"createWebhook">;
export type UpdateWebhookParams = Body<"updateWebhook">;
export type CreateApiKeyParams = Body<"createApiKey">;
export type UpdateDraftParams = Body<"updateDraft">;

export type ListParams = Query<"listInboxes">;
export type ListMessagesParams = Query<"listMessages">;
export type ListAllMessagesParams = Query<"listAllMessages">;
export type WaitParams = Omit<Query<"waitForMessage">, "timeout"> & {
  /** Seconds to wait. Up to 120 per request; longer waits are split into several requests. Default 30. */
  timeout?: number;
};
export type ListDraftsParams = Query<"listDrafts">;
export type ListAllDraftsParams = Query<"listAllDrafts">;
export type ListDeliveriesParams = Query<"listDeliveries">;

/** A message was sent, or (for approval inboxes) a draft was created instead. */
export type SendResult = Message | Draft;
export const isDraft = (r: SendResult): r is Draft => r.object === "draft";
