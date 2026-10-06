import { createTestDb } from "@send0/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, createAuth, type Auth } from "../src";

let auth: Auth;
let close: () => Promise<void>;
const err = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as AuthError
  );

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  auth = createAuth({
    db: t.db,
    mailer: {
      sendRaw: async () =>
        Promise.reject(
          new Error("SES rejected the message: Email address is not verified.")
        ),
    },
    from: { name: "send0", email: "noreply@send0.dev" },
    appUrl: "https://app.test",
  });
});
afterAll(() => close());

describe("when system email can't be delivered", () => {
  it("still signs the person up and logs them in", async () => {
    const { user, session } = await auth.accounts.signUp({
      email: "dana@acme.com",
      password: "tangerine-orbit-42",
    });
    expect(user.email).toBe("dana@acme.com");
    expect(await auth.sessions.resolve(session.token)).not.toBeNull();
  });

  it("tells them when asking for the link again fails", async () => {
    const user = (await auth.accounts.findByEmail("dana@acme.com"))!;
    const e = await err(auth.accounts.resendVerification(user));
    expect(e).toMatchObject({ status: 502, code: "email_failed" });
  });

  it("keeps password-reset requests silent, so they don't reveal accounts", async () => {
    await expect(
      auth.accounts.requestPasswordReset({ email: "dana@acme.com" })
    ).resolves.toBeUndefined();
  });

  it("keeps an invitation and says to resend it", async () => {
    const owner = await auth.accounts.createUser({
      email: "olivia@acme.com",
      password: "tangerine-orbit-42",
      verified: true,
    });
    const { token } = await auth.sessions.create(owner.id);
    const s = (await auth.sessions.resolve(token))!;
    const ws = await auth.workspaces.ensureFirst(s.user, "Acme", s.sessionId);
    const e = await err(
      auth.invites.create(ws, owner, { email: "mia@acme.com", role: "member" })
    );
    expect(e).toMatchObject({ status: 502, code: "email_failed" });
    expect(e?.message).toMatch(/Resend invitation/);
    expect((await auth.invites.listPending(ws)).map((i) => i.email)).toEqual([
      "mia@acme.com",
    ]);
  });
});
