import type { Mailer, SendRawInput } from "@send0/adapters/mailer";
import type { EventEnvelope, QueueMessage } from "@send0/pipeline";

/** A complete, valid set of vars and secrets. */
export const VARS = {
  MAIL_DOMAINS: "agents.acme.dev",
  SES_REGION: "us-east-1",
  ALLOW_SIGNUP: "false",
  SECRET_KEY: "k".repeat(48),
  OWNER_EMAIL: "owner@acme.dev",
  SES_ACCESS_KEY_ID: "AKIAEXAMPLE",
  SES_SECRET_ACCESS_KEY: "s".repeat(40),
  MAIL_FROM: "",
} as const;

/** A mailer that records what it would send through SES, for `createWorker({ createMailer })`. */
export function fakeMailer() {
  const sent: SendRawInput[] = [];
  const mailer: Mailer = {
    async sendRaw(input) {
      sent.push(input);
      return { providerMessageId: `fake-${sent.length}` };
    },
  };
  return { sent, createMailer: () => mailer };
}

/** An R2 bucket in memory: put, get and delete, which is all R2BlobStore uses. */
export function fakeR2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects,
    async put(key: string, body: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: body, ...(opts?.httpMetadata?.contentType ? { contentType: opts.httpMetadata.contentType } : {}) });
      return {};
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: new Response(o.bytes).body, httpMetadata: { contentType: o.contentType }, size: o.bytes.byteLength };
    },
    async delete(keys: string | string[]) {
      for (const k of [keys].flat()) objects.delete(k);
    },
  };
}

/** Fake bindings for Node: R2, the queue, the hub namespace and the assets fetcher. */
export function fakeEnv(vars: Record<string, string> = {}) {
  const sent: QueueMessage[] = [];
  const notified: { name: string; envelope: EventEnvelope }[] = [];
  const assetRequests: string[] = [];
  const env = {
    ...VARS,
    ...vars,
    HYPERDRIVE: { connectionString: "postgres://fake:fake@hyperdrive.local:5432/send0" },
    BLOBS: fakeR2(),
    EVENTS: {
      async send(message: QueueMessage) {
        sent.push(message);
      },
    },
    HUB: {
      idFromName: (name: string) => name,
      get: (name: string) => ({
        notify: async (envelope: EventEnvelope) => void notified.push({ name, envelope }),
        wait: async () => null,
        fetch: async () => new Response("", { headers: { "content-type": "text/event-stream" } }),
      }),
    },
    ASSETS: {
      fetch: async (req: Request) => {
        const path = new URL(req.url).pathname;
        assetRequests.push(path);
        return new Response(`asset ${path}`, { headers: { "content-type": "text/html" } });
      },
    },
  };
  return { env: env as unknown as Env, sent, notified, assetRequests, blobs: env.BLOBS };
}

/** An ExecutionContext whose waitUntil promises can be awaited. */
export function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {}, props: {} };
  return { ctx: ctx as unknown as ExecutionContext, settle: () => Promise.allSettled(pending) };
}
