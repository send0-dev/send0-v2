import { parseInbound } from "@send0/core";
import { createTestDb } from "@send0/db/testing";
import { describe, expect, it } from "vitest";
import { type AuthError, createAuth } from "../src";

const base = { from: { name: "send0", email: "noreply@acme.dev" }, appUrl: "https://mail.acme.dev" };
const mailer = { sendRaw: async () => ({ providerMessageId: "x" }) };
const err = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as AuthError,
  );

describe("sign-up gate", () => {
  it("is open by default (hosted)", async () => {
    const { db, close } = await createTestDb();
    const auth = createAuth({ db, mailer, ...base });
    await auth.accounts.signUp({ email: "a@acme.dev", password: "tangerine-orbit-42" });
    expect(await auth.accounts.signupOpen()).toBe(true);
    await auth.accounts.signUp({ email: "b@acme.dev", password: "tangerine-orbit-42" });
    await close();
  });

  it("with allowSignup off, lets only the first account in", async () => {
    const { db, close } = await createTestDb();
    const auth = createAuth({ db, mailer, ...base, allowSignup: false });
    expect(await auth.accounts.signupOpen()).toBe(true);
    await auth.accounts.signUp({ email: "owner@acme.dev", password: "tangerine-orbit-42" });
    expect(await auth.accounts.signupOpen()).toBe(false);
    const e = await err(auth.accounts.signUp({ email: "late@acme.dev", password: "tangerine-orbit-42" }));
    expect(e).toMatchObject({ status: 403, code: "signup_closed" });
    await close();
  });

  it("still lets an invitee join a closed install", async () => {
    const { db, close } = await createTestDb();
    const sent: { raw: string; recipients: string[] }[] = [];
    const auth = createAuth({
      db,
      mailer: { sendRaw: async (m) => (sent.push(m), { providerMessageId: "x" }) },
      ...base,
      allowSignup: false,
    });
    const user = await auth.accounts.createUser({ email: "owner@acme.dev", password: "tangerine-orbit-42", verified: true });
    const { token: sessionToken } = await auth.sessions.create(user.id);
    const s = (await auth.sessions.resolve(sessionToken))!;
    await auth.workspaces.ensureFirst(s.user, "Acme", s.sessionId);
    const ws = (await auth.sessions.resolve(sessionToken))!;
    await auth.invites.create(ws.workspace!, ws.user, { email: "a@acme.dev", role: "member" });
    const mail = sent.find((m) => m.recipients.includes("a@acme.dev"))!;
    const parsed = await parseInbound(mail.raw, { trustedAuthservIds: [] });
    const token = parsed.text.match(/https:\/\/mail\.acme\.dev\/invite\/(\S+)/)![1]!;
    const joined = await auth.invites.signUpAndAccept({ token, password: "tangerine-orbit-42" });
    expect(joined.user.email).toBe("a@acme.dev");
    await close();
  });
});
