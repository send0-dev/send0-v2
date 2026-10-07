import { parseCoreConfig } from "@send0/config";
import { createDb } from "@send0/db";
import { receiveMessage } from "@send0/pipeline";
import { blobStoreFromEnv } from "./blobs";

export default {
  async email(message, env) {
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 2 });
    await receiveMessage(message, parseCoreConfig(env), { db, blobs: blobStoreFromEnv(env), hub: env.HUB as never, queue: env.EVENTS });
  },

  // Nothing is served over HTTP.
  async fetch() {
    return new Response("send0 inbound\n", { headers: { "content-type": "text/plain" } });
  },
} satisfies ExportedHandler<Env>;
