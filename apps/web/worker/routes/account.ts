import { Hono } from "hono";
import { z } from "zod";
import type { WebEnv } from "../env";
import { clientMeta, ok, readBody, requireUser, requireVerified } from "../http";
import { clearSessionCookie, sessionToken, setSessionCookie } from "../middleware/session";
import { meJson } from "../serializers";

const email = z.string().trim().min(1, "Enter your email.").max(254);
const password = z.string().min(1, "Enter a password.").max(200);
const token = z.string().min(1).max(200);

/** Sign-up, login, email verification, passwords and profile. Mounted at /auth. */
export const accountRoutes = new Hono<WebEnv>()
  .get("/me", (c) => c.json(meJson(c.get("session"))))

  .post("/signup", async (c) => {
    const b = await readBody(c, z.object({ email, password, name: z.string().trim().max(80).optional() }));
    const { session } = await c.get("deps").auth.accounts.signUp({ ...b, ...clientMeta(c) });
    setSessionCookie(c, session.token, session.expiresAt);
    return ok(c, 201);
  })

  .post("/login", async (c) => {
    const b = await readBody(c, z.object({ email, password }));
    const { session } = await c.get("deps").auth.accounts.logIn({ ...b, ...clientMeta(c) });
    setSessionCookie(c, session.token, session.expiresAt);
    return ok(c);
  })

  .post("/logout", async (c) => {
    const t = sessionToken(c);
    if (t) await c.get("deps").auth.sessions.end(t);
    clearSessionCookie(c);
    return ok(c);
  })

  .post("/verify-email", async (c) => {
    const b = await readBody(c, z.object({ token }));
    await c.get("deps").auth.accounts.verifyEmail(b.token);
    return ok(c);
  })

  .post("/resend-verification", async (c) => {
    await c.get("deps").auth.accounts.resendVerification(requireUser(c).user);
    return ok(c);
  })

  .post("/forgot-password", async (c) => {
    const b = await readBody(c, z.object({ email }));
    await c.get("deps").auth.accounts.requestPasswordReset({ email: b.email, ip: clientMeta(c).ip });
    return ok(c);
  })

  .post("/reset-password", async (c) => {
    const b = await readBody(c, z.object({ token, password }));
    const { session } = await c.get("deps").auth.accounts.resetPassword({ ...b, ...clientMeta(c) });
    setSessionCookie(c, session.token, session.expiresAt);
    return ok(c);
  })

  .post("/change-password", async (c) => {
    const s = requireUser(c);
    const b = await readBody(c, z.object({ current: password, next: password }));
    await c.get("deps").auth.accounts.changePassword(s.user, { ...b, keepSessionId: s.sessionId });
    return ok(c);
  })

  /** Signs out every other device. */
  .post("/sessions/revoke-others", async (c) => {
    const s = requireUser(c);
    await c.get("deps").auth.sessions.endAll(s.user.id, s.sessionId);
    return ok(c);
  })

  .patch("/profile", async (c) => {
    const s = requireUser(c);
    const b = await readBody(c, z.object({ name: z.string().max(80).nullable() }));
    const user = await c.get("deps").auth.accounts.updateProfile(s.user, b);
    return c.json(meJson({ ...s, user }));
  })

  .post("/onboarding/finish", async (c) => {
    await c.get("deps").auth.accounts.finishOnboarding(requireVerified(c).user);
    return ok(c);
  });
