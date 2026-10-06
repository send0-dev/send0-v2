import type { SendRawInput } from "@send0/adapters/mailer";
import { AuthService } from "@send0/auth";
import { parseInbound } from "@send0/core";
import { createTestDb } from "@send0/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp as createApi } from "../../api/src/app";
import { createWebApp, SESSION_COOKIE } from "../worker/app";

const APP = "https://app.test";
const outbox: SendRawInput[] = [];
let close: () => Promise<void>;
let web: ReturnType<typeof createWebApp>;
let auth: AuthService;

beforeAll(async () => {
  const { db, close: c } = await createTestDb();
  close = c;
  auth = new AuthService({ db, mailer: { sendRaw: async (m) => (outbox.push(m), { providerMessageId: "x" }) }, from: { name: "send0", email: "noreply@send0.dev" }, appUrl: APP });
  await db.insert((await import("@send0/db")).schema.domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
  web = createWebApp({
    auth,
    appUrl: APP,
    // The real API, as the dashboard's private gateway would run it.
    gateway: async (req, orgId, userId) => createApi({ db, files: { signedGetUrl: async () => "x" }, presetAuth: { orgId, keyId: userId, mode: "live", scopes: ["admin"], inboxIds: null } }).fetch(req),
  });
});
afterAll(() => close());

/** A tiny cookie-keeping browser. */
function browser() {
  let cookie = "";
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await web.request(APP + path, {
      method,
      headers: { origin: APP, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set?.startsWith(`${SESSION_COOKIE}=`)) cookie = set.split(";")[0]!.endsWith("=") ? "" : set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

const lastLink = async (to: string) => {
  const m = [...outbox].reverse().find((x) => x.recipients.includes(to))!;
  return (await parseInbound(m.raw, { trustedAuthservIds: [] })).text.match(/https:\/\/app\.test\/\S+/)![0];
};

describe("dashboard server", () => {
  it("walks sign-up → verify → workspace → API, with a secure session cookie", async () => {
    const b = browser();
    const signup = await b("POST", "/auth/signup", { name: "Dana", email: "dana@acme.com", password: "tangerine-orbit-42" });
    expect(signup.status).toBe(201);
    expect(signup.headers.get("set-cookie")).toMatch(/send0_session=.+; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax/);

    expect((await b("GET", "/auth/me")).body.user).toMatchObject({ email: "dana@acme.com", email_verified: false, onboarded: false });
    // Unverified users can't reach the API or create a workspace.
    expect((await b("GET", "/api/v1/inboxes")).body.error.code).toBe("email_not_verified");
    expect((await b("POST", "/auth/workspace", { name: "Acme" })).status).toBe(403);

    const link = await lastLink("dana@acme.com");
    expect((await b("POST", "/auth/verify-email", { token: new URL(link).searchParams.get("token") })).status).toBe(200);
    expect((await b("GET", "/api/v1/inboxes")).body.error.code).toBe("no_workspace");

    const ws = await b("POST", "/auth/workspace", { name: "Acme" });
    expect(ws.body.org_id).toMatch(/^org_/);
    const inbox = await b("POST", "/api/v1/inboxes", { name: "dana-agent" });
    expect(inbox.status).toBe(201);
    expect(inbox.body.address).toBe("dana-agent@send0.email");
    const key = await b("POST", "/api/v1/api-keys", { name: "Default key", scopes: ["read", "send"] });
    expect(key.body.key).toMatch(/^s0_live_/);

    await b("POST", "/auth/onboarding/finish");
    expect((await b("GET", "/auth/me")).body.user).toMatchObject({ email_verified: true, onboarded: true, org_id: ws.body.org_id });
  });

  it("refuses cross-site state changes (CSRF)", async () => {
    const r = await web.request(APP + "/auth/login", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
    const noOrigin = await web.request(APP + "/auth/logout", { method: "POST" });
    expect(noOrigin.status).toBe(403);
  });

  it("logs in and out, and rejects bad passwords", async () => {
    const b = browser();
    expect((await b("POST", "/auth/login", { email: "dana@acme.com", password: "wrong-password-1" })).body.error.code).toBe("invalid_credentials");
    expect((await b("POST", "/auth/login", { email: "dana@acme.com", password: "tangerine-orbit-42" })).status).toBe(200);
    expect((await b("GET", "/api/v1/inboxes")).body.data).toHaveLength(1);
    await b("POST", "/auth/logout");
    expect((await b("GET", "/auth/me")).body.user).toBeNull();
    expect((await b("GET", "/api/v1/inboxes")).status).toBe(401);
  });

  it("keeps workspaces apart", async () => {
    const b = browser();
    await b("POST", "/auth/signup", { email: "other@corp.com", password: "violet-harbor-77" });
    await b("POST", "/auth/verify-email", { token: new URL(await lastLink("other@corp.com")).searchParams.get("token") });
    await b("POST", "/auth/workspace", { name: "Corp" });
    expect((await b("GET", "/api/v1/inboxes")).body.data).toEqual([]);
  });

  it("does the forgot/reset flow", async () => {
    const b = browser();
    expect((await b("POST", "/auth/forgot-password", { email: "dana@acme.com" })).status).toBe(200);
    const token = new URL(await lastLink("dana@acme.com")).searchParams.get("token");
    expect((await b("POST", "/auth/reset-password", { token, password: "granite-lake-55" })).status).toBe(200);
    expect((await b("GET", "/auth/me")).body.user.email).toBe("dana@acme.com");
  });

  it("never forwards dashboard cookies to the API, and strips the /api prefix", async () => {
    const seen: Request[] = [];
    const spyWeb = createWebApp({ auth, appUrl: APP, gateway: async (req) => (seen.push(req), Response.json({ ok: true })) });
    const login = await web.request(APP + "/auth/login", {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ email: "dana@acme.com", password: "granite-lake-55" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const r = await spyWeb.request(APP + "/api/v1/inboxes?limit=5", { headers: { cookie, "x-custom": "kept" } });
    expect(r.status).toBe(200);
    expect(new URL(seen[0]!.url).pathname + new URL(seen[0]!.url).search).toBe("/v1/inboxes?limit=5");
    expect(seen[0]!.headers.get("cookie")).toBeNull();
    expect(seen[0]!.headers.get("x-custom")).toBe("kept");
  });
});
