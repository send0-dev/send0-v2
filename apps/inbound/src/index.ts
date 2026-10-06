import { createDb } from "@send0/db";
import { blobStoreFromEnv } from "./blobs";
import { handleEmail } from "./handler";

export default {
  async email(message, env) {
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 2 });
    await handleEmail(message, env, { db, blobs: blobStoreFromEnv(env), hub: env.HUB as never, queue: env.EVENTS });
  },

  // Nothing is served over HTTP.
  async fetch() {
    return new Response("send0 inbound\n", { headers: { "content-type": "text/plain" } });
  },
} satisfies ExportedHandler<Env>;
