import type { SendRawInput } from "@send0/adapters/mailer";
import { parseInbound } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthError, AuthService, hashPassword, isDisposableEmail, passwordProblem, verifyPassword } from "../src";

let db: Db;
let close: () => Promise<void>;
let auth: AuthService;
const outbox: SendRawInput[] = [];
const lastLink = async (to: string) => {
  const mail = [...outbox].reverse().find((m) => m.recipients.includes(to));
  if (!mail) throw new Error(`no mail to ${to}`);
  const p = await parseInbound(mail.raw, { trustedAuthservIds: [] });
  return { subject: p.subject, link: p.text.match(/https:\/\/app\.test\/\S+/)?.[0] ?? null, from: p.from };
};
const tokenOf = (link: string | null) => new URL(link!).searchParams.get("token")!;
const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as AuthError);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = new AuthService({
    db,
    mailer: { sendRaw: async (m) => (outbox.push(m), { providerMessageId: "x" }) },
    from: { name: "send0", email: "noreply@send0.dev" },
    appUrl: "https://app.test",
  });
});
afterAll(() => close());
beforeEach(() => void (outbox.length = 0));

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong horse battery", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("checks strength sensibly", () => {
    expect(passwordProblem("short")).toMatch(/10 characters/);
    expect(passwordProblem("password1")).toMatch(/10 characters/);
    expect(passwordProblem("1234567890")).toMatch(/too common/);
    expect(passwordProblem("kunaldholiya-2026", "kunaldholiya@gmail.com")).toMatch(/email/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/easy/);
    expect(passwordProblem("tangerine-orbit-42")).toBeNull();
  });

  it("blocks disposable domains and our own shared domain", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@sub.yopmail.com")).toBe(true);
    expect(isDisposableEmail("agent@send0.email")).toBe(true);
    expect(isDisposableEmail("dana@acme.com")).toBe(false);
  });
});

describe("sign up → verify → onboard", () => {
  it("signs up, emails a verification link from noreply@send0.dev, and verifies", async () => {
    const { user, session } = await auth.signUp({ email: "Dana@Acme.com", password: "tangerine-orbit-42", name: "Dana Rivera", ip: "1.1.1.1" });
    expect(user.email).toBe("dana@acme.com");
    expect(user.emailVerifiedAt).toBeNull();
    expect(session.token.length).toBeGreaterThan(40);

    const mail = await lastLink("dana@acme.com");
    expect(mail.subject).toBe("Confirm your email for send0");
    expect(mail.from).toEqual({ name: "send0", email: "noreply@send0.dev" });
    expect(mail.link).toMatch(/^https:\/\/app\.test\/verify-email\?token=/);

    const verified = await auth.verifyEmail(tokenOf(mail.link));
    expect(verified.emailVerifiedAt).toBeInstanceOf(Date);
    // Single use
    expect((await err(auth.verifyEmail(tokenOf(mail.link))))?.code).toBe("invalid_token");
  });

  it("refuses duplicates, weak passwords, bad and disposable emails", async () => {
    expect((await err(auth.signUp({ email: "dana@acme.com", password: "tangerine-orbit-42" })))?.code).toBe("email_taken");
    expect((await err(auth.signUp({ email: "x@acme.com", password: "short" })))?.field).toBe("password");
    expect((await err(auth.signUp({ email: "not-an-email", password: "tangerine-orbit-42" })))?.code).toBe("invalid_email");
    expect((await err(auth.signUp({ email: "x@mailinator.com", password: "tangerine-orbit-42" })))?.code).toBe("disposable_email");
  });

  it("only lets verified users create a workspace, and creates it once", async () => {
    const { user } = await auth.signUp({ email: "unverified@acme.com", password: "tangerine-orbit-42" });
    expect((await err(auth.createWorkspace(user, "Acme")))?.code).toBe("email_not_verified");

    const [dana] = await db.select().from(schema.users).where(eq(schema.users.email, "dana@acme.com"));
    const orgId = await auth.createWorkspace(dana!, "Acme Procurement");
    expect(await auth.createWorkspace(dana!, "Acme Ops")).toBe(orgId);
    const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
    expect(org).toMatchObject({ name: "Acme Ops", plan: "free" });
  });

  it("invalidates older verification links when a new one is sent", async () => {
    const { user } = await auth.signUp({ email: "resend@acme.com", password: "tangerine-orbit-42" });
    const first = tokenOf((await lastLink("resend@acme.com")).link);
    await auth.resendVerification(user);
    const second = tokenOf((await lastLink("resend@acme.com")).link);
    expect((await err(auth.verifyEmail(first)))?.code).toBe("invalid_token");
    await auth.verifyEmail(second);
  });
});

describe("log in / sessions", () => {
  it("logs in, resolves the session with its org, and logs out", async () => {
    const { session } = await auth.logIn({ email: "DANA@acme.com", password: "tangerine-orbit-42" });
    const info = await auth.getSession(session.token);
    expect(info?.user.email).toBe("dana@acme.com");
    expect(info?.orgId).toMatch(/^org_/);
    await auth.logOut(session.token);
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const a = await err(auth.logIn({ email: "dana@acme.com", password: "wrong-password-123" }));
    const b = await err(auth.logIn({ email: "nobody@acme.com", password: "wrong-password-123" }));
    expect([a?.code, b?.code]).toEqual(["invalid_credentials", "invalid_credentials"]);
    expect(a?.message).toBe(b?.message);
  });

  it("rate-limits repeated failures per email", async () => {
    const attempts = [];
    for (let i = 0; i < 11; i++) attempts.push((await err(auth.logIn({ email: "victim@acme.com", password: "guess-number-" + i })))?.code);
    expect(attempts.slice(0, 10).every((c) => c === "invalid_credentials")).toBe(true);
    expect(attempts[10]).toBe("rate_limited");
  });

  it("stores only a hash of the session token", async () => {
    const { session } = await auth.logIn({ email: "dana@acme.com", password: "tangerine-orbit-42" });
    const rows = await db.select().from(schema.sessions);
    expect(rows.some((r) => r.tokenHash === session.token)).toBe(false);
  });
});

describe("forgot / reset password", () => {
  it("emails a reset link, sets the new password, and signs out every session", async () => {
    const old = await auth.logIn({ email: "dana@acme.com", password: "tangerine-orbit-42" });
    await auth.requestPasswordReset({ email: "dana@acme.com" });
    const mail = await lastLink("dana@acme.com");
    expect(mail.subject).toBe("Reset your send0 password");

    const { session } = await auth.resetPassword({ token: tokenOf(mail.link), password: "violet-harbor-77" });
    expect(await auth.getSession(old.session.token)).toBeNull();
    expect(await auth.getSession(session.token)).not.toBeNull();
    expect((await lastLink("dana@acme.com")).subject).toBe("Your send0 password was changed");
    expect((await err(auth.logIn({ email: "dana@acme.com", password: "tangerine-orbit-42" })))?.code).toBe("invalid_credentials");
    await auth.logIn({ email: "dana@acme.com", password: "violet-harbor-77" });
  });

  it("says nothing about unknown emails", async () => {
    await expect(auth.requestPasswordReset({ email: "nobody@acme.com" })).resolves.toBeUndefined();
    expect(outbox).toHaveLength(0);
  });

  it("rejects weak new passwords and reused links", async () => {
    await auth.requestPasswordReset({ email: "resend@acme.com" });
    const token = tokenOf((await lastLink("resend@acme.com")).link);
    expect((await err(auth.resetPassword({ token, password: "short" })))?.code).toBe("weak_password");
    await auth.resetPassword({ token, password: "copper-meadow-19" });
    expect((await err(auth.resetPassword({ token, password: "copper-meadow-20" })))?.code).toBe("invalid_token");
  });

  it("verifies the email when a reset link is used", async () => {
    const { user } = await auth.signUp({ email: "never-verified@acme.com", password: "tangerine-orbit-42" });
    expect(user.emailVerifiedAt).toBeNull();
    await auth.requestPasswordReset({ email: "never-verified@acme.com" });
    const { user: after } = await auth.resetPassword({ token: tokenOf((await lastLink("never-verified@acme.com")).link), password: "maple-river-31" });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("change password", () => {
  it("needs the current password and keeps only this session", async () => {
    const a = await auth.logIn({ email: "dana@acme.com", password: "violet-harbor-77" });
    const b = await auth.logIn({ email: "dana@acme.com", password: "violet-harbor-77" });
    const info = (await auth.getSession(a.session.token))!;
    expect((await err(auth.changePassword(info.user, { current: "nope-nope-nope", next: "granite-lake-55", keepSessionId: info.sessionId })))?.field).toBe("current");
    await auth.changePassword(info.user, { current: "violet-harbor-77", next: "granite-lake-55", keepSessionId: info.sessionId });
    expect(await auth.getSession(a.session.token)).not.toBeNull();
    expect(await auth.getSession(b.session.token)).toBeNull();
  });
});
