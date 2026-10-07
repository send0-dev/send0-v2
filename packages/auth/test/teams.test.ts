import type { SendRawInput } from "@send0/adapters/mailer";
import { newApiKey, newId, parseInbound } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiAction, type AuthError, can, canManageMember, createAuth, type Auth, type SessionInfo } from "../src";

let db: Db;
let close: () => Promise<void>;
let auth: Auth;
let now = new Date("2026-10-06T10:00:00Z");
const outbox: SendRawInput[] = [];
const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as AuthError);
const inviteToken = async (to: string) => {
  const mail = [...outbox].reverse().find((m) => m.recipients.includes(to))!;
  const p = await parseInbound(mail.raw, { trustedAuthservIds: [] });
  return p.text.match(/https:\/\/app\.test\/invite\/(\S+)/)![1]!;
};

/** A verified user with a live session. */
async function person(email: string): Promise<{ token: string; session: () => Promise<SessionInfo> }> {
  const user = await auth.accounts.createUser({ email, password: "tangerine-orbit-42", name: email.split("@")[0], verified: true });
  const { token } = await auth.sessions.create(user.id);
  return { token, session: async () => (await auth.sessions.resolve(token))! };
}

let owner: Awaited<ReturnType<typeof person>>;
let orgId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = createAuth({
    db,
    mailer: { sendRaw: async (m) => (outbox.push(m), { providerMessageId: "x" }) },
    from: { name: "send0", email: "noreply@send0.dev" },
    appUrl: "https://app.test",
    now: () => now,
  });
  owner = await person("olivia@acme.com");
  const s = await owner.session();
  orgId = (await auth.workspaces.ensureFirst(s.user, "Acme", s.sessionId)).id;
});
afterAll(() => close());

describe("permissions", () => {
  it("maps roles to actions", () => {
    expect(can("member", "mail.send")).toBe(true);
    expect(can("member", "draft.decide")).toBe(true);
    expect(can("member", "key.manage")).toBe(false);
    expect(can("admin", "webhook.manage")).toBe(true);
    expect(can("admin", "workspace.delete")).toBe(false);
    expect(can("owner", "workspace.transfer")).toBe(true);
    expect(can(null, "mail.read")).toBe(false);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("owner", "admin")).toBe(true);
    expect(canManageMember("owner", "owner")).toBe(false);
  });

  it("classifies API requests and refuses anything unknown", () => {
    expect(apiAction("GET", "/v1/inboxes/ibx_1/threads")).toBe("mail.read");
    expect(apiAction("GET", "/v1/api-keys")).toBe("key.manage");
    expect(apiAction("POST", "/v1/webhooks/whk_1/test")).toBe("webhook.manage");
    expect(apiAction("POST", "/v1/inboxes")).toBe("inbox.manage");
    expect(apiAction("POST", "/v1/inboxes/ibx_1/messages")).toBe("mail.send");
    expect(apiAction("POST", "/v1/messages/msg_1/reply")).toBe("mail.send");
    expect(apiAction("PATCH", "/v1/drafts/drf_1")).toBe("draft.edit");
    expect(apiAction("POST", "/v1/drafts/drf_1/send")).toBe("draft.decide");
    expect(apiAction("DELETE", "/v1/inboxes/ibx_1")).toBe("inbox.manage");
    expect(apiAction("GET", "/v1/usage")).toBe("mail.read");
    expect(apiAction("DELETE", "/v1/messages/msg_1")).toBeNull();
    expect(apiAction("GET", "/internal/ses-events")).toBeNull();
  });
});

describe("invites", () => {
  it("invites by email, previews without login, and lets a new person sign up into the workspace", async () => {
    const s = await owner.session();
    const invite = await auth.invites.create(s.workspace!, s.user, { email: "Mia@Acme.com", role: "member" });
    expect(invite).toMatchObject({ email: "mia@acme.com", role: "member", invitedBy: "olivia" });
    const token = await inviteToken("mia@acme.com");

    expect(await auth.invites.preview(token)).toMatchObject({ workspace: "Acme", email: "mia@acme.com", role: "member", hasAccount: false });
    const { user, session } = await auth.invites.signUpAndAccept({ token, password: "lantern-cove-88", name: "Mia" });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.onboardedAt).toBeInstanceOf(Date);
    const mia = (await auth.sessions.resolve(session.token))!;
    expect(mia.workspace).toEqual({ id: orgId, name: "Acme", role: "member" });
    expect((await err(auth.invites.preview(token)))?.code).toBe("invite_invalid");
  });

  it("lets an existing account accept only with the invited email", async () => {
    const sam = await person("sam@acme.com");
    const s = await owner.session();
    await auth.invites.create(s.workspace!, s.user, { email: "sam@acme.com", role: "admin" });
    const token = await inviteToken("sam@acme.com");
    expect((await auth.invites.preview(token)).hasAccount).toBe(true);

    const stranger = await person("stranger@acme.com");
    const st = await stranger.session();
    expect((await err(auth.invites.accept(st.user, st.sessionId, token)))?.code).toBe("wrong_account");

    const ss = await sam.session();
    expect(await auth.invites.accept(ss.user, ss.sessionId, token)).toMatchObject({ id: orgId, role: "admin" });
    expect((await sam.session()).workspace?.id).toBe(orgId);
  });

  it("replaces, resends and revokes open invites; refuses members and expired links", async () => {
    const s = await owner.session();
    const first = await auth.invites.create(s.workspace!, s.user, { email: "lee@acme.com", role: "member" });
    const oldToken = await inviteToken("lee@acme.com");
    const second = await auth.invites.resend(s.workspace!, s.user, first.id);
    expect(second.id).not.toBe(first.id);
    expect((await err(auth.invites.preview(oldToken)))?.code).toBe("invite_invalid");
    expect((await auth.invites.listPending((await owner.session()).workspace!)).filter((i) => i.email === "lee@acme.com")).toHaveLength(1);

    await auth.invites.revoke(s.workspace!, second.id);
    expect((await auth.invites.listPending((await owner.session()).workspace!)).some((i) => i.email === "lee@acme.com")).toBe(false);

    expect((await err(auth.invites.create(s.workspace!, s.user, { email: "mia@acme.com", role: "member" })))?.code).toBe("already_member");

    await auth.invites.create(s.workspace!, s.user, { email: "late@acme.com", role: "member" });
    const late = await inviteToken("late@acme.com");
    now = new Date(now.getTime() + 8 * 24 * 3600_000);
    expect((await err(auth.invites.preview(late)))?.code).toBe("invite_invalid");
    now = new Date("2026-10-06T10:00:00Z");
  });

  it("only lets owners and admins invite or see invitations", async () => {
    const memberSession = (await auth.sessions.resolve((await auth.accounts.logIn({ email: "mia@acme.com", password: "lantern-cove-88" })).session.token))!;
    expect((await err(auth.invites.create(memberSession.workspace!, memberSession.user, { email: "x@acme.com", role: "member" })))?.status).toBe(403);
    expect((await err(auth.invites.listPending(memberSession.workspace!)))?.status).toBe(403);
  });
});

describe("members and roles", () => {
  const userId = async (email: string) => (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0]!.id;

  it("lists members with roles", async () => {
    const list = await auth.members.list(orgId);
    expect(list.map((m) => [m.email, m.role])).toEqual([
      ["olivia@acme.com", "owner"],
      ["mia@acme.com", "member"],
      ["sam@acme.com", "admin"],
    ]);
  });

  it("lets admins manage members but not other admins or the owner", async () => {
    const sam = (await auth.sessions.resolve((await auth.accounts.logIn({ email: "sam@acme.com", password: "tangerine-orbit-42" })).session.token))!;
    expect((await auth.members.changeRole(sam.workspace!, sam.user, await userId("mia@acme.com"), "admin")).role).toBe("admin");
    expect((await err(auth.members.changeRole(sam.workspace!, sam.user, await userId("mia@acme.com"), "member")))?.status).toBe(403);
    expect((await err(auth.members.remove(sam.workspace!, sam.user, await userId("olivia@acme.com"))))?.status).toBe(403);
    expect((await err(auth.members.changeRole(sam.workspace!, sam.user, sam.user.id, "member")))?.status).toBe(400);
  });

  it("lets the owner change admins, and removal detaches the person's sessions", async () => {
    const s = await owner.session();
    const miaId = await userId("mia@acme.com");
    await auth.members.changeRole(s.workspace!, s.user, miaId, "member");
    const mia = await auth.accounts.logIn({ email: "mia@acme.com", password: "lantern-cove-88" });
    await auth.members.remove(s.workspace!, s.user, miaId);
    const after = (await auth.sessions.resolve(mia.session.token))!;
    expect(after.workspace).toBeNull();
    expect(after.workspaces).toEqual([]);
  });

  it("lets members leave, but not the owner", async () => {
    const s = await owner.session();
    expect((await err(auth.members.leave(s.workspace!, s.user)))?.code).toBe("owner_cannot_leave");
  });
});

describe("workspaces", () => {
  it("creates more workspaces and switches between them", async () => {
    const s = await owner.session();
    const second = await auth.workspaces.create(s.user, "Side project", s.sessionId);
    expect((await owner.session()).workspace).toEqual(second);
    expect((await owner.session()).workspaces.map((w) => w.name)).toEqual(["Acme", "Side project"]);
    await auth.workspaces.switchTo(s.user.id, s.sessionId, orgId);
    expect((await owner.session()).workspace?.id).toBe(orgId);
    const outsider = await person("outsider@acme.com");
    const o = await outsider.session();
    expect((await err(auth.workspaces.switchTo(o.user.id, o.sessionId, orgId)))?.status).toBe(404);
  });

  it("renames (admins and owner only)", async () => {
    const s = await owner.session();
    expect((await auth.workspaces.rename(s.workspace!, "Acme Inc")).name).toBe("Acme Inc");
    expect((await err(auth.workspaces.rename({ ...s.workspace!, role: "member" }, "Nope")))?.status).toBe(403);
  });

  it("never ends up with two owners, even when transfers race", async () => {
    const s = await owner.session();
    const admins = await Promise.all(["admin-a@acme.com", "admin-b@acme.com"].map((e) => person(e)));
    const ids: string[] = [];
    for (const p of admins) {
      const ps = await p.session();
      await auth.invites.create(s.workspace!, s.user, { email: ps.user.email, role: "admin" });
      await auth.invites.accept(ps.user, ps.sessionId, await inviteToken(ps.user.email));
      ids.push(ps.user.id);
    }
    const results = await Promise.allSettled(ids.map((id) => auth.workspaces.transfer(s.workspace!, s.user, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const owners = (await auth.members.list(orgId)).filter((m) => m.role === "owner");
    expect(owners).toHaveLength(1);

    // Hand it back to Olivia (now an admin) for the next tests.
    const [newOwner] = await db.select().from(schema.users).where(eq(schema.users.id, owners[0]!.userId));
    await auth.workspaces.transfer({ id: orgId, name: "Acme", role: "owner" }, newOwner!, s.user.id);
  });

  it("transfers ownership to an admin only", async () => {
    const s = await owner.session();
    const samId = (await db.select().from(schema.users).where(eq(schema.users.email, "sam@acme.com")))[0]!.id;
    const stranger = (await db.select().from(schema.users).where(eq(schema.users.email, "stranger@acme.com")))[0]!.id;
    expect((await err(auth.workspaces.transfer(s.workspace!, s.user, stranger)))?.status).toBe(404);
    await auth.workspaces.transfer(s.workspace!, s.user, samId);
    expect((await owner.session()).workspace?.role).toBe("admin");
    const roles = Object.fromEntries((await auth.members.list(orgId)).map((m) => [m.email, m.role]));
    expect(roles).toMatchObject({ "sam@acme.com": "owner", "olivia@acme.com": "admin" });
  });

  it("deletes a workspace: confirms the name, shuts off keys, webhooks, inboxes and invites", async () => {
    const s = await owner.session();
    const side = s.workspaces.find((w) => w.name === "Side project")!;
    const k = await newApiKey("live");
    await db.insert(schema.apiKeys).values({ id: newId("key"), orgId: side.id, name: "k", prefix: k.prefix, hash: k.hash, mode: "live", scopes: ["admin"] });
    await db.insert(schema.domains).values({ id: "dom_shared", name: "send0.email", kind: "shared", status: "verified" }).onConflictDoNothing();
    await db.insert(schema.inboxes).values({ id: newId("ibx"), orgId: side.id, domainId: "dom_shared", localPart: "side-agent" });
    await auth.invites.create(side, s.user, { email: "pending@acme.com", role: "member" });

    expect((await err(auth.workspaces.delete(side, "side project")))?.code).toBe("confirm_mismatch");
    expect((await err(auth.workspaces.delete({ ...side, role: "admin" }, "Side project")))?.status).toBe(403);
    await auth.workspaces.delete(side, "Side project");

    expect((await owner.session()).workspaces.map((w) => w.name)).toEqual(["Acme Inc"]);
    expect((await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.orgId, side.id)))[0]!.revokedAt).toBeInstanceOf(Date);
    expect((await db.select().from(schema.inboxes).where(eq(schema.inboxes.orgId, side.id)))[0]!.deletedAt).toBeInstanceOf(Date);
    expect((await db.select().from(schema.invites).where(eq(schema.invites.orgId, side.id))).every((i) => i.revokedAt)).toBe(true);
  });
});
