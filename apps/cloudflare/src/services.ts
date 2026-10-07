import { R2BlobStore, TokenUrlSigner } from "@send0/adapters/blob";
import { SesMailer, type Mailer } from "@send0/adapters/mailer";
import { durableHubClient } from "@send0/api/realtime/client";
import { bindingRateLimiter, MemoryRateLimiter } from "@send0/api/rate-limit";
import type { AppDeps } from "@send0/api/types";
import { createAuth, type Auth } from "@send0/auth";
import type { Db } from "@send0/db";
import { publish, type EventEnvelope } from "@send0/pipeline";
import type { CloudflareConfig, SesSettings } from "./config";

/** Makes a database client from Hyperdrive's connection string. Swapped for PGlite in tests. */
export type DbFactory = (connectionString: string, opts: { max: number }) => Db;

/** The bindings this Worker uses, as wrangler.jsonc declares them. */
export type Bindings = Pick<Env, "HYPERDRIVE" | "BLOBS" | "EVENTS" | "HUB" | "ASSETS"> &
  // Rate Limiting bindings. Optional: without one, that rule falls back to per-isolate counters.
  Partial<Pick<Env, "RL_KEY" | "RL_KEY_SEND" | "RL_IP">>;

/** Per-isolate counters, used only for a rule whose Rate Limiting binding is missing. */
const fallbackLimiter = new MemoryRateLimiter();

/** Makes the outbound mailer from the SES settings. Swapped for a recording fake in tests. */
export type MailerFactory = (ses: SesSettings) => Mailer;

/** The SES mailer, for customer mail and system email alike. */
export const createMailer: MailerFactory = (ses) => new SesMailer(ses);

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
  makeMailer: MailerFactory = createMailer,
): RequestServices {
  const blobs = new R2BlobStore(env.BLOBS);
  // R2 can't pre-sign without S3 credentials, so the API signs its own links and serves them at /v1/files/:token.
  const signer = new TokenUrlSigner({ secret: config.secretKey, baseUrl: publicUrl });
  const mailer = makeMailer(config.ses);
  const apiDeps: AppDeps = {
    db,
    mailDomains: config.mailDomains,
    limits: config.limits,
    files: signer,
    fileServer: { signer, reader: blobs },
    hub: durableHubClient(env.HUB),
    queue: env.EVENTS,
    mailer,
    publish: publisher(env),
    rateLimiter: bindingRateLimiter({ key: env.RL_KEY, key_send: env.RL_KEY_SEND, ip: env.RL_IP }, fallbackLimiter),
    ...(config.sesEvents ? { sesEvents: config.sesEvents } : {}),
    waitUntil: (p) => ctx.waitUntil(p),
  };
  const auth = createAuth({
    db,
    mailer,
    from: { name: "send0", email: config.mailFrom },
    appUrl: publicUrl,
    allowSignup: config.allowSignup,
    ...(config.ownerEmail ? { ownerEmail: config.ownerEmail } : {}),
  });
  return { db, auth, apiDeps, publicUrl };
}
