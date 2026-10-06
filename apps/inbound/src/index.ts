import { createDb } from "@send0/db";
import { blobStoreFromEnv } from "./blobs";
import { handleEmail } from "./handler";

export default {
  async email(message, env, ctx) {
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 2 });
    await handleEmail(message, env, { db, blobs: blobStoreFromEnv(env) });
  },

  // Nothing is served over HTTP.
  async fetch() {
    return new Response("send0 inbound\n", { headers: { "content-type": "text/plain" } });
  },
} satisfies ExportedHandler<Env>;
