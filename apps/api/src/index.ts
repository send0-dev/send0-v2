import { S3BlobStore } from "@send0/adapters/blob";
import { SesMailer } from "@send0/adapters/mailer";
import { parseCoreConfig } from "@send0/config";
import { createDb } from "@send0/db";
import { publish, type QueueMessage } from "@send0/pipeline";
import { WorkerEntrypoint } from "cloudflare:workers";
import { createApp } from "./app";
import { bindingRateLimiter, MemoryRateLimiter } from "./rate-limit";
import type { AppDeps, Scope } from "./types";
import { durableHubClient } from "./realtime/client";
import { purgeDeletedOrgs } from "./maintenance";
import { processQueueMessage, sweep } from "./webhooks/dispatch";

export { Hub } from "./realtime/hub-do";

/** Per-isolate counters, used only for a rule whose Rate Limiting binding is missing. */
const fallbackLimiter = new MemoryRateLimiter();

const db = (env: Env, max = 5) => createDb(env.HYPERDRIVE.connectionString, { max });

function makeDeps(env: Env, ctx: ExecutionContext): AppDeps {
  const core = parseCoreConfig(env);
  return {
    db: db(env),
    mailDomains: core.mailDomains,
    limits: core.limits,
    // Read-only credentials: this key can GetObject under raw/ and att/ and nothing else.
    files: new S3BlobStore({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    }),
    hub: durableHubClient(env.HUB),
    queue: env.EVENTS,
    // Only when its keys exist: a missing secret disables sending instead of breaking every route.
    mailer:
      env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY
        ? new SesMailer({
            region: env.SES_REGION,
            configurationSet: env.SES_CONFIGURATION_SET,
            accessKeyId: env.SES_ACCESS_KEY_ID,
            secretAccessKey: env.SES_SECRET_ACCESS_KEY,
          })
        : undefined,
    publish: (orgId, envelope) => publish({ hub: env.HUB as never, queue: env.EVENTS }, orgId, envelope),
    rateLimiter: bindingRateLimiter({ key: env.RL_KEY, key_send: env.RL_KEY_SEND, ip: env.RL_IP }, fallbackLimiter),
    sesEvents: env.SES_EVENTS_TOKEN ? { token: env.SES_EVENTS_TOKEN, topicArn: env.SES_EVENTS_TOPIC_ARN } : undefined,
    waitUntil: (p) => ctx.waitUntil(p),
  };
}

/**
 * Private entrypoint for the dashboard Worker (service binding only, never public).
 * The dashboard has already authenticated the user; requests run as an org admin.
 */
export class DashboardGateway extends WorkerEntrypoint<Env> {
  /** Runs the API as a dashboard member of `orgId`. The dashboard has already checked the member's role. */
  async handle(request: Request, as: { orgId: string; userId: string; scopes: Scope[] }): Promise<Response> {
    const deps = makeDeps(this.env, this.ctx);
    deps.presetAuth = { orgId: as.orgId, keyId: as.userId, mode: "live", scopes: as.scopes, inboxIds: null, actor: "user" };
    return createApp(deps).fetch(request, this.env, this.ctx);
  }
}

export default {
  async fetch(request, env, ctx) {
    return createApp(makeDeps(env, ctx)).fetch(request, env, ctx);
  },

  // Webhook fan-out and delivery attempts.
  async queue(batch, env) {
    const conn = db(env, 2);
    for (const msg of batch.messages) {
      try {
        await processQueueMessage(conn, env.EVENTS, msg.body);
        msg.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "queue.error",
            body: msg.body,
            error: String(err),
          }),
        );
        msg.retry({ delaySeconds: 30 });
      }
    }
    // The database is awake anyway: catch anything the outbox missed.
    await sweep(conn, env.EVENTS, new Date()).catch((err) => console.error(JSON.stringify({ event: "sweep.error", error: String(err) })));
  },

  // Hourly safety net for the outbox. Kept infrequent so Neon can scale to zero between runs.
  async scheduled(_controller, env) {
    const now = new Date();
    const swept = await sweep(db(env, 1), env.EVENTS, now);
    if (swept.events || swept.deliveries) console.log(JSON.stringify({ event: "sweep", ...swept }));
    const purged = await purgeDeletedOrgs(db(env, 1), now);
    if (purged) console.log(JSON.stringify({ event: "orgs_purged", count: purged }));
  },
} satisfies ExportedHandler<Env, QueueMessage>;
