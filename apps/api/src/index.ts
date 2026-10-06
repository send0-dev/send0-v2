import { S3BlobStore } from "@send0/adapters/blob";
import { createDb } from "@send0/db";
import { createApp } from "./app";

export default {
  async fetch(request, env, ctx) {
    // One small client per request; Hyperdrive does the pooling.
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 5 });
    // Read-only credentials: this key can GetObject under raw/ and att/ and nothing else.
    const files = new S3BlobStore({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
    const app = createApp({ db, files, waitUntil: (p) => ctx.waitUntil(p) });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
