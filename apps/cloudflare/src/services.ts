import { R2BlobStore, TokenUrlSigner } from "@send0/adapters/blob";
import { SesMailer, type Mailer } from "@send0/adapters/mailer";
import { durableHubClient } from "@send0/api/realtime/client";
import type { AppDeps } from "@send0/api/types";
import { createAuth, type Auth } from "@send0/auth";
import type { Db } from "@send0/db";
import { publish, type EventEnvelope } from "@send0/pipeline";
import type { CloudflareConfig } from "./config";

/** Makes a database client from Hyperdrive's connection string. Swapped for PGlite in tests. */
export type DbFactory = (connectionString: string, opts: { max: number }) => Db;

/** The bindings this Worker uses, as wrangler.jsonc declares them. */
export type Bindings = Pick<Env, "HYPERDRIVE" | "BLOBS" | "EVENTS" | "HUB" | "ASSETS">;

/** The SES mailer, or undefined when its keys are missing. */
export function createMailer(config: Pick<CloudflareConfig, "ses">): Mailer | undefined {
  return config.ses ? new SesMailer(config.ses) : undefined;
}

/** After an event commits: wake the hubs and queue webhook fan-out, exactly as hosted. Never throws. */
export function publisher(env: Pick<Bindings, "HUB" | "EVENTS">): (orgId: string, envelope: EventEnvelope) => Promise<void> {
  return (orgId, envelope) => publish({ hub: env.HUB as never, queue: env.EVENTS }, orgId, envelope);
}

/** Everything an HTTP request needs. Cheap to build, so it is built per request with that request's public URL. */
export interface RequestServices {
  db: Db;
  auth: Auth;
  /** What `createApp` needs; the dashboard gateway adds `presetAuth` */
  apiDeps: AppDeps;
  publicUrl: string;
}

/** Wires the API and dashboard around the bindings for one request. */
export function requestServices(
  env: Bindings,
  ctx: Pick<ExecutionContext, "waitUntil">,
  config: CloudflareConfig,
  db: Db,
  publicUrl: string,
): RequestServices {
  const blobs = new R2BlobStore(env.BLOBS);
  // R2 can't pre-sign without S3 credentials, so the API signs its own links and serves them at /v1/files/:token.
  const signer = new TokenUrlSigner({ secret: config.secretKey, baseUrl: publicUrl });
  const mailer = createMailer(config);
  const apiDeps: AppDeps = {
    db,
    mailDomains: config.mailDomains,
    limits: config.limits,
    files: signer,
    fileServer: { signer, reader: blobs },
    hub: durableHubClient(env.HUB),
    queue: env.EVENTS,
    ...(mailer ? { mailer } : {}),
    publish: publisher(env),
    ...(config.sesEvents ? { sesEvents: config.sesEvents } : {}),
    waitUntil: (p) => ctx.waitUntil(p),
  };
  const auth = createAuth({
    db,
    ...(mailer ? { mailer } : {}),
    from: { name: "send0", email: config.mailFrom },
    appUrl: publicUrl,
    allowSignup: config.allowSignup,
    ...(config.ownerEmail ? { ownerEmail: config.ownerEmail } : {}),
  });
  return { db, auth, apiDeps, publicUrl };
}
