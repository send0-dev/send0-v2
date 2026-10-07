import { apiAction } from "@send0/auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { operations } from "../../api/src/openapi/spec";
import { deliver, fixture } from "../../api/test/helpers";
import { createWebApp } from "../worker/app";
import { APP, createHarness } from "./harness";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => void (h = await createHarness()));
afterAll(() => h.close());

const tokenOf = (link: string) => new URL(link).searchParams.get("token");

describe("accounts", () => {
  it("walks sign-up → verify → workspace → API, with a secure session cookie", async () => {
    const b = h.browser();
    const signup = await b("POST", "/auth/signup", { name: "Dana", email: "dana@acme.com", password: "tangerine-orbit-42" });
    expect(signup.status).toBe(201);
    expect(signup.headers.get("set-cookie")).toMatch(/send0_session=.+; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax/);

    expect((await b("GET", "/auth/me")).body).toMatchObject({
      user: { email: "dana@acme.com", email_verified: false, onboarded: false },
      workspace: null,
      workspaces: [],
    });
    expect((await b("GET", "/api/v1/inboxes")).body.error.code).toBe("email_not_verified");
    expect((await b("POST", "/auth/workspace", { name: "Acme" })).status).toBe(403);

    expect((await b("POST", "/auth/verify-email", { token: tokenOf(await h.lastLink("dana@acme.com")) })).status).toBe(200);
    expect((await b("GET", "/api/v1/inboxes")).body.error.code).toBe("no_workspace");

    const ws = await b("POST", "/auth/workspace", { name: "Acme" });
    expect(ws.body).toMatchObject({ id: expect.stringMatching(/^org_/), name: "Acme", role: "owner" });
    expect((await b("POST", "/api/v1/inboxes", { name: "dana-agent" })).body.address).toBe("dana-agent@send0.email");
    expect((await b("POST", "/api/v1/api-keys", { name: "Default key", scopes: ["read", "send"] })).body.key).toMatch(/^s0_live_/);
    expect((await b("GET", "/api/v1/usage")).body).toMatchObject({ object: "usage", inboxes: { used: 1 } });

    await b("POST", "/auth/onboarding/finish");
    expect((await b("GET", "/auth/me")).body).toMatchObject({ user: { onboarded: true }, workspace: { id: ws.body.id, role: "owner" } });
  });

  it("validates bodies and names the field", async () => {
    const r = await h.browser()("POST", "/auth/login", { email: "", password: "x" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: "invalid_request", field: "email" });
  });

  it("refuses cross-site state changes (CSRF)", async () => {
    const r = await h.web.request(APP + "/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(403);
    expect((await h.web.request(APP + "/auth/logout", { method: "POST" })).status).toBe(403);
  });

  it("logs in and out, and rejects bad passwords", async () => {
    const b = h.browser();
    expect((await b("POST", "/auth/login", { email: "dana@acme.com", password: "wrong-password-1" })).body.error.code).toBe(
      "invalid_credentials",
    );
    expect((await b("POST", "/auth/login", { email: "dana@acme.com", password: "tangerine-orbit-42" })).status).toBe(200);
    expect((await b("GET", "/api/v1/inboxes")).body.data).toHaveLength(1);
    await b("POST", "/auth/logout");
    expect((await b("GET", "/auth/me")).body.user).toBeNull();
    expect((await b("GET", "/api/v1/inboxes")).status).toBe(401);
  });

  it("does the forgot/reset flow and can sign out other devices", async () => {
    const other = h.browser();
    await other("POST", "/auth/login", { email: "dana@acme.com", password: "tangerine-orbit-42" });
    const b = h.browser();
    expect((await b("POST", "/auth/forgot-password", { email: "dana@acme.com" })).status).toBe(200);
    expect(
      (await b("POST", "/auth/reset-password", { token: tokenOf(await h.lastLink("dana@acme.com")), password: "granite-lake-55" })).status,
    ).toBe(200);
    expect((await b("GET", "/auth/me")).body.user.email).toBe("dana@acme.com");
    expect((await other("GET", "/auth/me")).body.user).toBeNull();

    const third = h.browser();
    await third("POST", "/auth/login", { email: "dana@acme.com", password: "granite-lake-55" });
    await b("POST", "/auth/sessions/revoke-others");
    expect((await third("GET", "/auth/me")).body.user).toBeNull();
    expect((await b("GET", "/auth/me")).body.user).not.toBeNull();
  });
});

describe("API proxy", () => {
  it("never forwards cookies or Authorization, strips /api, and passes the member's scopes", async () => {
    const seen: { req: Request; as: unknown }[] = [];
    const spy = createWebApp({
      auth: h.auth,
      appUrl: APP,
      instance: { mailDomains: ["send0.email"] },
      gateway: async (req, as) => (seen.push({ req, as }), Response.json({ ok: true })),
    });
    const login = await h.web.request(APP + "/auth/login", {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ email: "dana@acme.com", password: "granite-lake-55" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const r = await spy.request(APP + "/api/v1/inboxes?limit=5", {
      headers: { cookie, authorization: "Bearer s0_live_x", "x-custom": "kept" },
    });
    expect(r.status).toBe(200);
    const { req, as } = seen[0]!;
    expect(new URL(req.url).pathname + new URL(req.url).search).toBe("/v1/inboxes?limit=5");
    expect(req.headers.get("cookie")).toBeNull();
    expect(req.headers.get("authorization")).toBeNull();
    expect(req.headers.get("x-custom")).toBe("kept");
    expect(as).toMatchObject({ orgId: expect.stringMatching(/^org_/), scopes: ["admin"] });
  });

  it("refuses requests meant for a workspace the session has since left", async () => {
    const b = h.browser();
    await b("POST", "/auth/login", { email: "dana@acme.com", password: "granite-lake-55" });
    const ws = (await b("GET", "/auth/me")).body.workspace.id;
    expect((await b("GET", "/api/v1/inboxes", undefined, { "x-send0-workspace": ws })).status).toBe(200);
    const stale = await b("POST", "/api/v1/inboxes", { name: "wrong-place" }, { "x-send0-workspace": "org_other" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("workspace_changed");
  });

  it("refuses endpoints outside the permission table", async () => {
    const b = h.browser();
    await b("POST", "/auth/login", { email: "dana@acme.com", password: "granite-lake-55" });
    expect((await b("GET", "/api/internal/ses-events")).status).toBe(404);
  });

  it("has a permission rule for every API operation the dashboard can proxy", () => {
    // Public routes (signed file links) carry their own credential and never go through the dashboard.
    const missing = operations.filter((op) => !op.public && !apiAction(op.method, op.path.replace(/\{[^}]+\}/g, "x_1")));
    expect(missing.map((op) => `${op.method} ${op.path}`)).toEqual([]);
  });
});

describe("teams", () => {
  it("invites a member who signs up from the link and gets member-only access", async () => {
    const owner = await h.person("olivia@team.com", "Team");
    const inv = await owner("POST", "/auth/invites", { email: "mia@team.com", role: "member" });
    expect(inv.status).toBe(201);
    expect((await owner("GET", "/auth/invites")).body.data.map((i: any) => i.email)).toEqual(["mia@team.com"]);
    const token = new URL(await h.lastLink("mia@team.com")).pathname.split("/").pop()!;

    const mia = h.browser();
    expect((await mia("GET", `/auth/invites/token/${token}`)).body).toMatchObject({
      workspace: "Team",
      email: "mia@team.com",
      role: "member",
      has_account: false,
    });
    expect((await mia("POST", `/auth/invites/token/${token}/signup`, { password: "lantern-cove-88", name: "Mia" })).status).toBe(201);
    expect((await mia("GET", "/auth/me")).body).toMatchObject({
      user: { email_verified: true, onboarded: true },
      workspace: { name: "Team", role: "member" },
    });

    // Members read and send, but can't manage inboxes, keys, webhooks or people.
    await owner("POST", "/api/v1/inboxes", { name: "team-agent" });
    expect((await mia("GET", "/api/v1/inboxes")).body.data).toHaveLength(1);
    expect((await mia("POST", "/api/v1/inboxes", { name: "nope" })).status).toBe(403);
    expect((await mia("GET", "/api/v1/api-keys")).status).toBe(403);
    expect((await mia("GET", "/api/v1/webhooks")).status).toBe(403);
    expect((await mia("POST", "/auth/invites", { email: "x@team.com", role: "member" })).status).toBe(403);
    expect((await mia("PATCH", "/auth/workspace", { name: "Mine" })).status).toBe(403);
  });

  it("lets a member edit and approve drafts in the dashboard", async () => {
    const owner = h.browser();
    await owner("POST", "/auth/login", { email: "olivia@team.com", password: "tangerine-orbit-42" });
    const inbox = (await owner("GET", "/api/v1/inboxes")).body.data[0];
    await owner("PATCH", `/api/v1/inboxes/${inbox.id}`, { send_policy: "approval" });
    await deliver(h.db, inbox.address, fixture("gmail-reply.eml")); // dana@gmail.com writes first
    const draft = await owner("POST", `/api/v1/inboxes/${inbox.id}/messages`, { to: "dana@gmail.com", subject: "Hi", text: "x" });
    expect(draft.status).toBe(202);

    const mia = h.browser();
    await mia("POST", "/auth/login", { email: "mia@team.com", password: "lantern-cove-88" });
    expect((await mia("GET", "/api/v1/drafts?status=pending")).body.data.map((d: any) => d.id)).toEqual([draft.body.id]);
    expect((await mia("PATCH", `/api/v1/drafts/${draft.body.id}`, { text: "edited by mia" })).body.text).toBe("edited by mia");
    const sent = await mia("POST", `/api/v1/drafts/${draft.body.id}/send`);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ object: "message", direction: "out", text: "edited by mia" });
  });

  it("manages members, switches workspaces and deletes one", async () => {
    const owner = h.browser();
    await owner("POST", "/auth/login", { email: "olivia@team.com", password: "tangerine-orbit-42" });
    const members = (await owner("GET", "/auth/members")).body.data;
    expect(members.map((m: any) => [m.email, m.role])).toEqual([
      ["olivia@team.com", "owner"],
      ["mia@team.com", "member"],
    ]);
    const miaId = members[1].user_id;
    expect((await owner("PATCH", `/auth/members/${miaId}`, { role: "admin" })).body.role).toBe("admin");

    const side = await owner("POST", "/auth/workspaces", { name: "Side" });
    expect(side.status).toBe(201);
    expect((await owner("GET", "/auth/me")).body.workspace.name).toBe("Side");
    expect((await owner("GET", "/api/v1/inboxes")).body.data).toEqual([]);
    expect((await owner("DELETE", "/auth/workspace", { confirm: "Side" })).status).toBe(200);
    const me = (await owner("GET", "/auth/me")).body;
    expect(me.workspace.name).toBe("Team");
    expect(me.workspaces.map((w: any) => w.name)).toEqual(["Team"]);

    expect((await owner("DELETE", `/auth/members/${miaId}`)).status).toBe(200);
    const mia = h.browser();
    await mia("POST", "/auth/login", { email: "mia@team.com", password: "lantern-cove-88" });
    expect((await mia("GET", "/auth/me")).body.workspace).toBeNull();
    expect((await mia("GET", "/api/v1/inboxes")).body.error.code).toBe("no_workspace");
  });
});

describe("instance info", () => {
  it("tells the app its mail domains and whether sign-up is open", async () => {
    const h = await createHarness();
    const b = h.browser();
    expect((await b("GET", "/auth/instance")).body).toEqual({ mail_domains: ["send0.email"], signup_open: true });
    await h.close();
  });

  it("reports sign-up closed once the first account exists on an invite-only install", async () => {
    const h = await createHarness({ allowSignup: false });
    const b = h.browser();
    expect((await b("GET", "/auth/instance")).body.signup_open).toBe(true);
    await b("POST", "/auth/signup", { email: "owner@acme.dev", password: "tangerine-orbit-42", name: "Owner" });
    expect((await h.browser()("GET", "/auth/instance")).body.signup_open).toBe(false);
    await h.close();
  });
});
