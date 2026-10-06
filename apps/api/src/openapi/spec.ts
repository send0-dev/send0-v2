import { z } from "zod";
import { listQuery } from "../pagination";
import { apiKeyCreateBody } from "../routes/api-keys";
import { streamQuery } from "../routes/events";
import { inboxCreateBody, inboxUpdateBody } from "../routes/inboxes";
import { messageListQuery, waitQuery } from "../routes/messages";
import {
  draftListQuery,
  forwardBody,
  replyBody,
  sendBody,
} from "../routes/send";
import { threadGetQuery } from "../routes/threads";
import {
  deliveryListQuery,
  webhookCreateBody,
  webhookUpdateBody,
} from "../routes/webhooks";
import { registry } from "./schemas";

type Method = "get" | "post" | "patch" | "delete";
type Scope = "read" | "send" | "admin";

export interface Operation {
  method: Method;
  /** OpenAPI path, e.g. /v1/inboxes/{inbox_id} */
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  scope: Scope;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** status → component schema name, or a special kind */
  responses: Record<number, string | { redirect: string } | { sse: true }>;
}

const P = {
  inbox: { name: "inbox_id", description: "Inbox id (ibx_…)" },
  thread: { name: "thread_id", description: "Thread id (thr_…)" },
  message: { name: "message_id", description: "Message id (msg_…)" },
  attachment: { name: "attachment_id", description: "Attachment id (att_…)" },
  key: { name: "api_key_id", description: "API key id (key_…)" },
  webhook: { name: "webhook_id", description: "Webhook id (whk_…)" },
  delivery: { name: "delivery_id", description: "Delivery id (dlv_…)" },
  draft: { name: "draft_id", description: "Draft id (drf_…)" },
};

/** Every public endpoint. A test checks this list against the app's real routes, both ways. */
export const operations: Operation[] = [
  // Inboxes
  {
    method: "post",
    path: "/v1/inboxes",
    operationId: "createInbox",
    tag: "Inboxes",
    scope: "send",
    summary: "Create an inbox",
    description:
      "Creates `name@send0.email` (or on a verified custom domain). Omit `name` for a random address.",
    body: inboxCreateBody,
    responses: { 201: "Inbox" },
  },
  {
    method: "get",
    path: "/v1/inboxes",
    operationId: "listInboxes",
    tag: "Inboxes",
    scope: "read",
    summary: "List inboxes",
    query: listQuery,
    responses: { 200: "InboxList" },
  },
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}",
    operationId: "getInbox",
    tag: "Inboxes",
    scope: "read",
    summary: "Get an inbox",
    responses: { 200: "Inbox" },
  },
  {
    method: "patch",
    path: "/v1/inboxes/{inbox_id}",
    operationId: "updateInbox",
    tag: "Inboxes",
    scope: "send",
    summary: "Update an inbox",
    body: inboxUpdateBody,
    responses: { 200: "Inbox" },
  },
  {
    method: "delete",
    path: "/v1/inboxes/{inbox_id}",
    operationId: "deleteInbox",
    tag: "Inboxes",
    scope: "admin",
    summary: "Delete an inbox",
    description:
      "Mail to the address is refused from now on. The address is never reassigned.",
    responses: { 200: "DeletedInbox" },
  },

  // Messages
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}/messages",
    operationId: "listMessages",
    tag: "Messages",
    scope: "read",
    summary: "List and search messages",
    description:
      "Newest first. `from` accepts wildcards such as `*@acme.dev`; `q` is full-text search over subject and body.",
    query: messageListQuery,
    responses: { 200: "MessageList" },
  },
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}/messages/wait",
    operationId: "waitForMessage",
    tag: "Messages",
    scope: "read",
    summary: "Wait for a message",
    description:
      "Long-poll. Returns the first message matching the filters received at or after `since` (default: one minute before the call), waiting up to `timeout` seconds. Codes and links are already extracted.",
    query: waitQuery,
    responses: { 200: "WaitResult" },
  },
  {
    method: "post",
    path: "/v1/inboxes/{inbox_id}/messages",
    operationId: "sendMessage",
    tag: "Messages",
    scope: "send",
    summary: "Send a message",
    description:
      "Starts a new thread. Inboxes with `send_policy: approval` return a draft (202) instead.",
    body: sendBody,
    responses: { 201: "Message", 202: "Draft" },
  },
  {
    method: "get",
    path: "/v1/messages/{message_id}",
    operationId: "getMessage",
    tag: "Messages",
    scope: "read",
    summary: "Get a message",
    responses: { 200: "Message" },
  },
  {
    method: "get",
    path: "/v1/messages/{message_id}/raw",
    operationId: "getRawMessage",
    tag: "Messages",
    scope: "read",
    summary: "Download the original .eml",
    responses: {
      302: {
        redirect:
          "Pre-signed download link for the raw message, valid 15 minutes",
      },
    },
  },
  {
    method: "get",
    path: "/v1/messages/{message_id}/attachments/{attachment_id}",
    operationId: "getAttachment",
    tag: "Messages",
    scope: "read",
    summary: "Get an attachment download link",
    responses: { 200: "AttachmentDownload" },
  },
  {
    method: "post",
    path: "/v1/messages/{message_id}/reply",
    operationId: "replyToMessage",
    tag: "Messages",
    scope: "send",
    summary: "Reply to a message",
    description:
      "Replies in the same thread with correct In-Reply-To and References.",
    body: replyBody,
    responses: { 201: "Message", 202: "Draft" },
  },
  {
    method: "post",
    path: "/v1/messages/{message_id}/forward",
    operationId: "forwardMessage",
    tag: "Messages",
    scope: "send",
    summary: "Forward a message",
    body: forwardBody,
    responses: { 201: "Message", 202: "Draft" },
  },

  // Threads
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}/threads",
    operationId: "listThreads",
    tag: "Threads",
    scope: "read",
    summary: "List threads",
    description: "Most recent activity first.",
    query: listQuery,
    responses: { 200: "ThreadList" },
  },
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}/threads/{thread_id}",
    operationId: "getThread",
    tag: "Threads",
    scope: "read",
    summary: "Get a thread with its messages",
    description: "Messages oldest first. HTML only with `include_html=true`.",
    query: threadGetQuery,
    responses: { 200: "ThreadWithMessages" },
  },

  // Drafts
  {
    method: "get",
    path: "/v1/inboxes/{inbox_id}/drafts",
    operationId: "listDrafts",
    tag: "Drafts",
    scope: "read",
    summary: "List drafts",
    query: draftListQuery,
    responses: { 200: "DraftList" },
  },
  {
    method: "get",
    path: "/v1/drafts/{draft_id}",
    operationId: "getDraft",
    tag: "Drafts",
    scope: "read",
    summary: "Get a draft",
    responses: { 200: "Draft" },
  },
  {
    method: "post",
    path: "/v1/drafts/{draft_id}/send",
    operationId: "sendDraft",
    tag: "Drafts",
    scope: "admin",
    summary: "Approve and send a draft",
    responses: { 201: "Message" },
  },
  {
    method: "post",
    path: "/v1/drafts/{draft_id}/reject",
    operationId: "rejectDraft",
    tag: "Drafts",
    scope: "admin",
    summary: "Reject a draft",
    responses: { 200: "Draft" },
  },

  // Webhooks
  {
    method: "post",
    path: "/v1/webhooks",
    operationId: "createWebhook",
    tag: "Webhooks",
    scope: "admin",
    summary: "Create a webhook",
    body: webhookCreateBody,
    responses: { 201: "WebhookWithSecret" },
  },
  {
    method: "get",
    path: "/v1/webhooks",
    operationId: "listWebhooks",
    tag: "Webhooks",
    scope: "admin",
    summary: "List webhooks",
    query: listQuery,
    responses: { 200: "WebhookList" },
  },
  {
    method: "get",
    path: "/v1/webhooks/{webhook_id}",
    operationId: "getWebhook",
    tag: "Webhooks",
    scope: "admin",
    summary: "Get a webhook",
    responses: { 200: "Webhook" },
  },
  {
    method: "patch",
    path: "/v1/webhooks/{webhook_id}",
    operationId: "updateWebhook",
    tag: "Webhooks",
    scope: "admin",
    summary: "Update a webhook",
    body: webhookUpdateBody,
    responses: { 200: "Webhook" },
  },
  {
    method: "delete",
    path: "/v1/webhooks/{webhook_id}",
    operationId: "deleteWebhook",
    tag: "Webhooks",
    scope: "admin",
    summary: "Delete a webhook",
    responses: { 200: "DeletedWebhook" },
  },
  {
    method: "post",
    path: "/v1/webhooks/{webhook_id}/rotate-secret",
    operationId: "rotateWebhookSecret",
    tag: "Webhooks",
    scope: "admin",
    summary: "Rotate the signing secret",
    responses: { 200: "WebhookWithSecret" },
  },
  {
    method: "post",
    path: "/v1/webhooks/{webhook_id}/test",
    operationId: "testWebhook",
    tag: "Webhooks",
    scope: "admin",
    summary: "Send a test event",
    responses: { 202: "WebhookTestResult" },
  },
  {
    method: "get",
    path: "/v1/webhooks/{webhook_id}/deliveries",
    operationId: "listDeliveries",
    tag: "Webhooks",
    scope: "admin",
    summary: "List delivery attempts",
    query: deliveryListQuery,
    responses: { 200: "DeliveryList" },
  },
  {
    method: "post",
    path: "/v1/webhooks/{webhook_id}/deliveries/{delivery_id}/retry",
    operationId: "retryDelivery",
    tag: "Webhooks",
    scope: "admin",
    summary: "Replay a delivery",
    responses: { 202: "Delivery" },
  },

  // Events
  {
    method: "get",
    path: "/v1/events/stream",
    operationId: "streamEvents",
    tag: "Events",
    scope: "read",
    summary: "Stream events (SSE)",
    description:
      "Server-Sent Events for one inbox (`inbox_id`) or the whole organization. Send `Last-Event-ID` to resume.",
    query: streamQuery,
    responses: { 200: { sse: true } },
  },

  // API keys
  {
    method: "post",
    path: "/v1/api-keys",
    operationId: "createApiKey",
    tag: "API keys",
    scope: "admin",
    summary: "Create an API key",
    description: "The full key is returned once.",
    body: apiKeyCreateBody,
    responses: { 201: "ApiKeyWithSecret" },
  },
  {
    method: "get",
    path: "/v1/api-keys",
    operationId: "listApiKeys",
    tag: "API keys",
    scope: "admin",
    summary: "List API keys",
    query: listQuery,
    responses: { 200: "ApiKeyList" },
  },
  {
    method: "delete",
    path: "/v1/api-keys/{api_key_id}",
    operationId: "revokeApiKey",
    tag: "API keys",
    scope: "admin",
    summary: "Revoke an API key",
    responses: { 200: "RevokedApiKey" },
  },
];

const PARAM_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.values(P).map((p) => [p.name, p.description])
);

const jsonSchema = (s: z.ZodType) => {
  const out = z.toJSONSchema(s, {
    io: "input",
    unrepresentable: "any",
    target: "draft-2020-12",
  }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** The OpenAPI 3.1 document for the public API. */
export function buildOpenApi(
  opts: { serverUrl?: string; version?: string } = {}
) {
  const components = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: "draft-2020-12",
  }) as { schemas: Record<string, Record<string, unknown>> };
  for (const s of Object.values(components.schemas)) delete s.$schema;
  for (const s of Object.values(components.schemas)) delete s.id;

  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const pathParams = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      description: PARAM_DESCRIPTIONS[m[1]!],
      schema: { type: "string" },
    }));
    const queryParams = op.query
      ? Object.entries(op.query.shape).map(([name, schema]) => {
          const js = jsonSchema(schema as z.ZodType);
          const required = !(schema as z.ZodType).safeParse(undefined).success;
          return {
            name,
            in: "query",
            required,
            ...(js.description ? { description: js.description } : {}),
            schema: js,
          };
        })
      : [];

    const responses: Record<string, unknown> = {};
    for (const [status, r] of Object.entries(op.responses)) {
      if (typeof r === "string")
        responses[status] = {
          description: r,
          content: { "application/json": { schema: ref(r) } },
        };
      else if ("redirect" in r)
        responses[status] = {
          description: r.redirect,
          headers: { Location: { schema: { type: "string" } } },
        };
      else
        responses[status] = {
          description: "Event stream",
          content: {
            "text/event-stream": {
              schema: {
                type: "string",
                description:
                  "Each `data:` line is a JSON Event (see the Event schema).",
              },
            },
          },
          "x-send0-event-schema": ref("Event"),
        };
    }
    for (const [status, description] of [
      ["400", "Invalid request"],
      ["401", "Missing or invalid API key"],
      ["403", "Not allowed (scope, policy or account state)"],
      ["404", "Not found, or not visible to this key"],
      ["429", "Rate or daily limit reached"],
    ] as const) {
      responses[status] = {
        description,
        content: { "application/json": { schema: ref("Error") } },
      };
    }

    paths[op.path] ??= {};
    paths[op.path]![op.method] = {
      operationId: op.operationId,
      summary: op.summary,
      ...(op.description ? { description: op.description } : {}),
      tags: [op.tag],
      "x-send0-scope": op.scope,
      parameters: [
        ...pathParams,
        ...queryParams,
        ...(op.method === "post"
          ? [
              {
                name: "Idempotency-Key",
                in: "header",
                required: false,
                description:
                  "Retry-safe POSTs: same key + same body returns the stored response for 24 hours.",
                schema: { type: "string", maxLength: 255 },
              },
            ]
          : []),
      ],
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: jsonSchema(op.body) } },
            },
          }
        : {}),
      responses,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "send0 API",
      version: opts.version ?? "1.0.0",
      description:
        "Email inboxes for AI agents: create an address, receive, wait, reply, and get webhooks. https://send0.dev",
      license: { name: "AGPL-3.0", identifier: "AGPL-3.0-only" },
    },
    servers: [{ url: opts.serverUrl ?? "https://api.send0.dev" }],
    security: [{ bearerAuth: [] }],
    tags: [
      "Inboxes",
      "Messages",
      "Threads",
      "Drafts",
      "Webhooks",
      "Events",
      "API keys",
    ].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key: s0_live_… or s0_test_…",
        },
      },
      schemas: components.schemas,
    },
  };
}
