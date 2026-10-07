import { Send0Error } from "./errors";
import { Http, type ClientOptions } from "./http";
import { Page } from "./pagination";
import { parseSse } from "./sse";
import type {
  ApiKey,
  ApiKeyWithSecret,
  AttachmentDownload,
  CreateApiKeyParams,
  CreateInboxParams,
  CreateWebhookParams,
  Delivery,
  Draft,
  Event,
  ForwardParams,
  Inbox,
  ListDeliveriesParams,
  ListAllDraftsParams,
  ListAllMessagesParams,
  ListDraftsParams,
  ListMessagesParams,
  ListParams,
  Message,
  ReplyParams,
  SendMessageParams,
  SendResult,
  Thread,
  ThreadWithMessages,
  UpdateDraftParams,
  UpdateInboxParams,
  UpdateWebhookParams,
  Usage,
  Stats,
  StatsParams,
  WaitParams,
  WaitResult,
  Webhook,
  WebhookWithSecret,
} from "./types";
import { verifyWebhook } from "./webhooks";

type ListBody<T> = { data: T[]; next_cursor: string | null };
const MAX_WAIT_PER_REQUEST = 120;

function pager<T, P extends { cursor?: string }>(http: Http, path: string, params: P | undefined) {
  const load = async (cursor?: string): Promise<Page<T>> => {
    const body = await http.request<ListBody<T>>("GET", path, {
      query: { ...(params as object), ...(cursor ? { cursor } : {}) },
    });
    return new Page(body.data, body.next_cursor, (c) => load(c));
  };
  return load(params?.cursor);
}

const enc = encodeURIComponent;

/**
 * Per-call options for sends. Pass the same `idempotencyKey` when retrying one logical send
 * (e.g. after a network error) and the API returns the first result instead of sending twice.
 */
export interface SendOptions {
  idempotencyKey?: string;
}

class Inboxes {
  constructor(private readonly http: Http) {}

  /** Create an inbox. `{ name: "research-agent" }` → research-agent@send0.email. Omit name for a random one. */
  create(params: CreateInboxParams = {}): Promise<Inbox> {
    return this.http.request("POST", "/v1/inboxes", { body: params });
  }
  list(params?: ListParams): Promise<Page<Inbox>> {
    return pager(this.http, "/v1/inboxes", params);
  }
  get(inboxId: string): Promise<Inbox> {
    return this.http.request("GET", `/v1/inboxes/${enc(inboxId)}`);
  }
  update(inboxId: string, params: UpdateInboxParams): Promise<Inbox> {
    return this.http.request("PATCH", `/v1/inboxes/${enc(inboxId)}`, {
      body: params,
    });
  }
  delete(inboxId: string): Promise<Inbox & { deleted: true }> {
    return this.http.request("DELETE", `/v1/inboxes/${enc(inboxId)}`);
  }

  /**
   * Waits for the first message matching the filters and returns it, or null on timeout.
   * The one-time code and links are already extracted: `msg.extracted.otp`, `msg.extracted.action_link`.
   *
   *   const msg = await send0.inboxes.wait(inbox.id, { from: "*@github.com", timeout: 60 });
   */
  async wait(inboxId: string, params: WaitParams = {}, opts: { signal?: AbortSignal } = {}): Promise<Message | null> {
    let remaining = params.timeout ?? 30;
    // Keep the original look-back across split requests so nothing between them is missed.
    const since = params.since ?? new Date(Date.now() - 60_000).toISOString();
    for (;;) {
      const timeout = Math.max(1, Math.min(MAX_WAIT_PER_REQUEST, Math.ceil(remaining)));
      const r = await this.http.request<WaitResult>("GET", `/v1/inboxes/${enc(inboxId)}/messages/wait`, {
        query: { ...params, since, timeout },
        timeout: (timeout + 15) * 1000,
        signal: opts.signal,
      });
      if (!r.timed_out) return r.message;
      // The server waited the full timeout before giving up; count that, not the wall clock (which can jump).
      remaining -= timeout;
      if (remaining < 1) return null;
    }
  }
}

class Messages {
  constructor(private readonly http: Http) {}

  /** Newest first. `from` accepts wildcards (`*@acme.dev`); `q` is full-text search. */
  list(inboxId: string, params?: ListMessagesParams): Promise<Page<Message>> {
    return pager(this.http, `/v1/inboxes/${enc(inboxId)}/messages`, params);
  }
  /** Every inbox the key can see, newest first. Filter with `inbox_id`, `status`, `direction`, `q`… */
  listAll(params?: ListAllMessagesParams): Promise<Page<Message>> {
    return pager(this.http, "/v1/messages", params);
  }
  get(messageId: string): Promise<Message> {
    return this.http.request("GET", `/v1/messages/${enc(messageId)}`);
  }
  /** Sends a new message. Approval inboxes return a Draft instead: check with `isDraft()`. */
  send(inboxId: string, params: SendMessageParams, opts: SendOptions = {}): Promise<SendResult> {
    return this.http.request("POST", `/v1/inboxes/${enc(inboxId)}/messages`, {
      body: params,
      idempotencyKey: opts.idempotencyKey,
    });
  }
  /** Replies in the same thread with correct In-Reply-To and References. */
  reply(messageId: string, params: ReplyParams, opts: SendOptions = {}): Promise<SendResult> {
    return this.http.request("POST", `/v1/messages/${enc(messageId)}/reply`, {
      body: params,
      idempotencyKey: opts.idempotencyKey,
    });
  }
  forward(messageId: string, params: ForwardParams, opts: SendOptions = {}): Promise<SendResult> {
    return this.http.request("POST", `/v1/messages/${enc(messageId)}/forward`, {
      body: params,
      idempotencyKey: opts.idempotencyKey,
    });
  }
  /** A short-lived URL to download the original .eml. */
  async rawUrl(messageId: string): Promise<string> {
    const res = await this.http.request<Response>("GET", `/v1/messages/${enc(messageId)}/raw`, { raw: true, redirect: "manual" });
    const location = res.headers.get("location");
    if (location) return location;
    // Some runtimes follow redirects regardless; the final URL is then the download link.
    if (res.url && !res.url.startsWith(this.http.baseUrl)) return res.url;
    throw new Send0Error("No download link returned.", res.status, "no_download_url");
  }
  /** Attachment metadata with a short-lived `download_url`. */
  attachment(messageId: string, attachmentId: string): Promise<AttachmentDownload> {
    return this.http.request("GET", `/v1/messages/${enc(messageId)}/attachments/${enc(attachmentId)}`);
  }
}

class Threads {
  constructor(private readonly http: Http) {}

  list(inboxId: string, params?: ListParams): Promise<Page<Thread>> {
    return pager(this.http, `/v1/inboxes/${enc(inboxId)}/threads`, params);
  }
  /** The thread with its messages, oldest first. */
  get(inboxId: string, threadId: string, params: { include_html?: boolean } = {}): Promise<ThreadWithMessages> {
    return this.http.request("GET", `/v1/inboxes/${enc(inboxId)}/threads/${enc(threadId)}`, { query: params });
  }
}

class Drafts {
  constructor(private readonly http: Http) {}

  list(inboxId: string, params?: ListDraftsParams): Promise<Page<Draft>> {
    return pager(this.http, `/v1/inboxes/${enc(inboxId)}/drafts`, params);
  }
  /** Drafts in every inbox the key can see. `{ status: "pending" }` is the approval queue. */
  listAll(params?: ListAllDraftsParams): Promise<Page<Draft>> {
    return pager(this.http, "/v1/drafts", params);
  }
  get(draftId: string): Promise<Draft> {
    return this.http.request("GET", `/v1/drafts/${enc(draftId)}`);
  }
  /** Edit the subject or body of a pending draft (admin key, like approving). */
  update(draftId: string, params: UpdateDraftParams): Promise<Draft> {
    return this.http.request("PATCH", `/v1/drafts/${enc(draftId)}`, { body: params });
  }
  /** Approve and send (admin key). */
  send(draftId: string): Promise<Message> {
    return this.http.request("POST", `/v1/drafts/${enc(draftId)}/send`);
  }
  reject(draftId: string): Promise<Draft> {
    return this.http.request("POST", `/v1/drafts/${enc(draftId)}/reject`);
  }
}

class Webhooks {
  constructor(private readonly http: Http) {}

  /** Returns the signing secret once. Store it to verify deliveries. */
  create(params: CreateWebhookParams): Promise<WebhookWithSecret> {
    return this.http.request("POST", "/v1/webhooks", { body: params });
  }
  list(params?: ListParams): Promise<Page<Webhook>> {
    return pager(this.http, "/v1/webhooks", params);
  }
  get(webhookId: string): Promise<Webhook> {
    return this.http.request("GET", `/v1/webhooks/${enc(webhookId)}`);
  }
  update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.http.request("PATCH", `/v1/webhooks/${enc(webhookId)}`, {
      body: params,
    });
  }
  delete(webhookId: string): Promise<Webhook & { deleted: true }> {
    return this.http.request("DELETE", `/v1/webhooks/${enc(webhookId)}`);
  }
  rotateSecret(webhookId: string): Promise<WebhookWithSecret> {
    return this.http.request("POST", `/v1/webhooks/${enc(webhookId)}/rotate-secret`);
  }
  test(webhookId: string): Promise<{
    object: "event";
    id: string;
    type: "webhook.test";
    delivery_id: string;
  }> {
    return this.http.request("POST", `/v1/webhooks/${enc(webhookId)}/test`);
  }
  deliveries(webhookId: string, params?: ListDeliveriesParams): Promise<Page<Delivery>> {
    return pager(this.http, `/v1/webhooks/${enc(webhookId)}/deliveries`, params);
  }
  retryDelivery(webhookId: string, deliveryId: string): Promise<Delivery> {
    return this.http.request("POST", `/v1/webhooks/${enc(webhookId)}/deliveries/${enc(deliveryId)}/retry`);
  }

  /** Verifies a delivery's `send0-signature` header against the raw body. */
  verify(rawBody: string, signatureHeader: string | null | undefined, secret: string): Promise<boolean> {
    return verifyWebhook(rawBody, signatureHeader, secret);
  }
}

class ApiKeys {
  constructor(private readonly http: Http) {}

  /** Returns the full key once. */
  create(params: CreateApiKeyParams): Promise<ApiKeyWithSecret> {
    return this.http.request("POST", "/v1/api-keys", { body: params });
  }
  list(params?: ListParams): Promise<Page<ApiKey>> {
    return pager(this.http, "/v1/api-keys", params);
  }
  revoke(apiKeyId: string): Promise<ApiKey & { revoked: true }> {
    return this.http.request("DELETE", `/v1/api-keys/${enc(apiKeyId)}`);
  }
}

class UsageApi {
  constructor(private readonly http: Http) {}

  /** Plan, inboxes used, sends today against the daily limit, and whether sending is paused. */
  get(): Promise<Usage> {
    return this.http.request("GET", "/v1/usage");
  }
  /** Mail per UTC day (received, sent, delivered, bounced, failed) for charts. Default 14 days. */
  stats(params: StatsParams = {}): Promise<Stats> {
    return this.http.request("GET", "/v1/stats", { query: params });
  }
}

class Events {
  constructor(private readonly http: Http) {}

  /**
   * Live events (SSE) for one inbox or the whole organization. Reconnects automatically and
   * resumes from the last event it saw, so nothing is missed. Stop with an AbortSignal or `break`.
   *
   *   for await (const event of send0.events.stream({ inboxId })) { … }
   */
  async *stream(opts: { inboxId?: string; lastEventId?: string; signal?: AbortSignal } = {}): AsyncGenerator<Event> {
    let lastId = opts.lastEventId;
    let failures = 0;
    while (!opts.signal?.aborted) {
      try {
        const res = await this.http.request<Response>("GET", "/v1/events/stream", {
          query: { inbox_id: opts.inboxId },
          headers: { accept: "text/event-stream", ...(lastId ? { "last-event-id": lastId } : {}) },
          raw: true,
          signal: opts.signal,
          timeout: 24 * 60 * 60 * 1000,
        });
        if (!res.body) throw new Send0Error("The server returned no event stream.", res.status, "no_stream");
        failures = 0;
        for await (const msg of parseSse(res.body)) {
          if (msg.id) lastId = msg.id;
          yield JSON.parse(msg.data) as Event;
        }
      } catch (err) {
        if (opts.signal?.aborted) return;
        // Bad key, missing inbox, wrong scope: reconnecting won't help.
        if (err instanceof Send0Error && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      }
      // Stream ended or failed: back off, then resume from the last event.
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** failures++)));
    }
  }
}

/**
 * The send0 client.
 *
 *   import { Send0 } from "@send0/sdk";
 *   const send0 = new Send0(process.env.SEND0_API_KEY);
 *   const inbox = await send0.inboxes.create({ name: "signup-agent" });
 */
export class Send0 {
  readonly inboxes: Inboxes;
  readonly messages: Messages;
  readonly threads: Threads;
  readonly drafts: Drafts;
  readonly webhooks: Webhooks;
  readonly apiKeys: ApiKeys;
  readonly events: Events;
  readonly usage: UsageApi;

  constructor(options?: ClientOptions | string) {
    const http = new Http(options);
    this.inboxes = new Inboxes(http);
    this.messages = new Messages(http);
    this.threads = new Threads(http);
    this.drafts = new Drafts(http);
    this.webhooks = new Webhooks(http);
    this.apiKeys = new ApiKeys(http);
    this.events = new Events(http);
    this.usage = new UsageApi(http);
  }
}
