import { S3BlobStore } from "@send0/adapters/blob";
import { SesMailer } from "@send0/adapters/mailer";
import { createDb } from "@send0/db";
import { publish, type QueueMessage } from "@send0/pipeline";
import { createApp } from "./app";
import { durableHubClient } from "./realtime/client";
import { processQueueMessage, sweep } from "./webhooks/dispatch";

export { Hub } from "./realtime/hub-do";

const db = (env: Env, max = 5) => createDb(env.HYPERDRIVE.connectionString, { max });

export default {
  async fetch(request, env, ctx) {
    // Read-only credentials: this key can GetObject under raw/ and att/ and nothing else.
    const files = new S3BlobStore({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
    const app = createApp({
      db: db(env),
      files,
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
      sesEvents: env.SES_EVENTS_TOKEN ? { token: env.SES_EVENTS_TOKEN, topicArn: env.SES_EVENTS_TOPIC_ARN } : undefined,
      waitUntil: (p) => ctx.waitUntil(p),
    });
    return app.fetch(request, env, ctx);
  },

  // Webhook fan-out and delivery attempts.
  async queue(batch, env) {
    const conn = db(env, 2);
    for (const msg of batch.messages) {
      try {
        await processQueueMessage(conn, env.EVENTS, msg.body);
        msg.ack();
      } catch (err) {
        console.error(JSON.stringify({ event: "queue.error", body: msg.body, error: String(err) }));
        msg.retry({ delaySeconds: 30 });
      }
    }
    // The database is awake anyway: catch anything the outbox missed.
    await sweep(conn, env.EVENTS, new Date()).catch((err) => console.error(JSON.stringify({ event: "sweep.error", error: String(err) })));
  },

  // Hourly safety net for the outbox. Kept infrequent so Neon can scale to zero between runs.
  async scheduled(_controller, env) {
    const swept = await sweep(db(env, 1), env.EVENTS, new Date());
    if (swept.events || swept.deliveries) console.log(JSON.stringify({ event: "sweep", ...swept }));
  },
} satisfies ExportedHandler<Env, QueueMessage>;
