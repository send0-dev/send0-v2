import { createDb } from "@send0/db";
import { emailRoutingForwarder, type InboundDeps } from "@send0/pipeline";
import { blobStoreFromEnv, type BlobEnv } from "./blobs";

export interface InboundEnv extends BlobEnv {
  HYPERDRIVE: { connectionString: string };
  HUB: unknown;
  EVENTS: InboundDeps["queue"];
  OPERATOR_FORWARD_TO?: string;
}

/** Everything `receiveMessage` needs, from the Worker's bindings and vars. */
export function inboundDeps(env: InboundEnv): InboundDeps {
  const forwardReserved = emailRoutingForwarder(env.OPERATOR_FORWARD_TO);
  return {
    db: createDb(env.HYPERDRIVE.connectionString, { max: 2 }),
    blobs: blobStoreFromEnv(env),
    hub: env.HUB as never,
    queue: env.EVENTS,
    ...(forwardReserved ? { forwardReserved } : {}),
  };
}
