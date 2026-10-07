import { SesMailer } from "@send0/adapters/mailer";
import { createAuth } from "@send0/auth";
import { parseCoreConfig } from "@send0/config";
import { createDb } from "@send0/db";
import { createWebApp, type Gateway } from "./app";

/** The API's DashboardGateway RPC entrypoint (types can't be inferred across Workers). */
interface DashboardGateway {
  handle: (...args: Parameters<Gateway>) => ReturnType<Gateway>;
}

export default {
  async fetch(request, env, ctx) {
    const core = parseCoreConfig(env);
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 3 });
    const auth = createAuth({
      db,
      // Only when its keys exist: a missing secret disables email instead of breaking sign-in.
      mailer:
        env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY
          ? new SesMailer({
              region: env.SES_REGION,
              configurationSet: env.SES_CONFIGURATION_SET,
              accessKeyId: env.SES_ACCESS_KEY_ID,
              secretAccessKey: env.SES_SECRET_ACCESS_KEY,
            })
          : undefined,
      from: { name: "send0", email: env.MAIL_FROM },
      allowSignup: core.allowSignup,
      appUrl: env.APP_URL,
    });
    const app = createWebApp({
      auth,
      appUrl: env.APP_URL,
      secureCookies: new URL(request.url).protocol === "https:",
      instance: { mailDomains: core.mailDomains },
      gateway: (req, as) => (env.API as unknown as DashboardGateway).handle(req, as),
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
