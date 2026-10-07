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
});
