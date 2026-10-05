import { blobStoreFromEnv } from "./blobs";
import { handleEmail } from "./handler";

export default {
  async email(message, env) {
    await handleEmail(message, env, blobStoreFromEnv(env));
  },

  // Nothing is served over HTTP yet; answer health checks only.
  async fetch() {
    return new Response("send0 inbound\n", { headers: { "content-type": "text/plain" } });
  },
} satisfies ExportedHandler<Env>;
