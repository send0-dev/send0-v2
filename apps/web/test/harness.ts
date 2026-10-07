import type { SendRawInput } from "@send0/adapters/mailer";
import { createAuth, type Auth } from "@send0/auth";
import { parseInbound } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { createApp as createApi } from "../../api/src/app";
import { createWebApp, SESSION_COOKIE, type Gateway } from "../worker/app";

export const APP = "https://app.test";

/** The dashboard Worker over an in-memory Postgres, with the real API behind its gateway. */
export async function createHarness(opts: { gateway?: Gateway } = {}) {
  const { db, close } = await createTestDb();
  const outbox: SendRawInput[] = [];
  const auth: Auth = createAuth({
    db,
    mailer: { sendRaw: async (m) => (outbox.push(m), { providerMessageId: "x" }) },
    from: { name: "send0", email: "noreply@send0.dev" },
    appUrl: APP,
  });
  await db.insert(schema.domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
  const gateway: Gateway =
    opts.gateway ??
    (async (req, as) =>
      createApi({
        db,
        files: { signedGetUrl: async () => "https://files.test/x" },
        mailer: { sendRaw: async () => ({ providerMessageId: "ses-x" }) },
        presetAuth: { orgId: as.orgId, keyId: as.userId, mode: "live", scopes: as.scopes, inboxIds: null, actor: "user" },
      }).fetch(req));
  const web = createWebApp({ auth, appUrl: APP, gateway });

  /** The newest link emailed to `to`. */
  const lastLink = async (to: string) => {
    const m = [...outbox].reverse().find((x) => x.recipients.includes(to));
    if (!m) throw new Error(`no email to ${to}`);
    return (await parseInbound(m.raw, { trustedAuthservIds: [] })).text.match(/https:\/\/app\.test\/\S+/)![0];
  };

  /** A tiny cookie-keeping browser. */
  const browser = () => {
    let cookie = "";
    return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await web.request(APP + path, {
        method,
        headers: {
          origin: APP,
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set?.startsWith(`${SESSION_COOKIE}=`)) cookie = set.split(";")[0]!.endsWith("=") ? "" : set.split(";")[0]!;
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
    };
  };

  /** A verified, onboarded person with their own workspace, logged in. */
  const person = async (email: string, workspace = `${email.split("@")[0]}'s team`) => {
    const b = browser();
    await b("POST", "/auth/signup", { email, password: "tangerine-orbit-42", name: email.split("@")[0] });
    await b("POST", "/auth/verify-email", { token: new URL(await lastLink(email)).searchParams.get("token") });
    await b("POST", "/auth/workspace", { name: workspace });
    await b("POST", "/auth/onboarding/finish");
    return b;
  };

  return { db: db as Db, close, auth, web, outbox, lastLink, browser, person };
}
