import { SesMailer } from "@send0/adapters/mailer";
import { AuthService } from "@send0/auth";
import { createDb } from "@send0/db";
import { createWebApp } from "./app";

/** The API's DashboardGateway RPC entrypoint (types can't be inferred across Workers). */
interface Gateway {
  handle(request: Request, orgId: string, userId: string): Promise<Response>;
}

export default {
  async fetch(request, env, ctx) {
    const db = createDb(env.HYPERDRIVE.connectionString, { max: 3 });
    const auth = new AuthService({
      db,
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
      appUrl: env.APP_URL,
    });
    const app = createWebApp({
      auth,
      appUrl: env.APP_URL,
      secureCookies: new URL(request.url).protocol === "https:",
      gateway: (req, orgId, userId) => (env.API as unknown as Gateway).handle(req, orgId, userId),
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
