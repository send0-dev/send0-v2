import { parseCoreConfig } from "@send0/config";
import { receiveMessage } from "@send0/pipeline";
import { inboundDeps } from "./deps";

export default {
  async email(message, env) {
    await receiveMessage(message, parseCoreConfig(env), inboundDeps(env));
  },

  // Nothing is served over HTTP.
  async fetch() {
    return new Response("send0 inbound\n", { headers: { "content-type": "text/plain" } });
  },
} satisfies ExportedHandler<Env>;
