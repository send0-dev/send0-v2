import { AuthError, type AuthService, type SessionInfo } from "@send0/auth";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE = "send0_session";

export interface WebDeps {
  auth: AuthService;
  /** Forwards an API request as the signed-in user's org (the API's DashboardGateway). */
  gateway: (
    request: Request,
    orgId: string,
    userId: string
  ) => Promise<Response>;
  /** e.g. https://app.send0.dev, used for the origin check */
  appUrl: string;
  /** false only in local dev over http */
  secureCookies?: boolean;
}

type Env = { Variables: { session: SessionInfo | null } };

const publicUser = (s: SessionInfo) => ({
  id: s.user.id,
  email: s.user.email,
  name: s.user.name,
  email_verified: !!s.user.emailVerifiedAt,
  onboarded: !!s.user.onboardedAt,
  org_id: s.orgId,
  org_name: s.orgName,
});

export function createWebApp(deps: WebDeps) {
  const app = new Hono<Env>();
  const secure = deps.secureCookies ?? true;

  const setSession = (c: Context, token: string, expires: Date) =>
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      expires,
    });

  const meta = (c: Context) => ({
    ip:
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  // CSRF: browsers always send Origin on cross-site POST/PATCH/DELETE. Only our own origin may change state.
  app.use("*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin !== new URL(deps.appUrl).origin)
        return c.json(
          {
            error: {
              code: "forbidden",
              message: "Cross-site request refused.",
            },
          },
          403
        );
    }
    c.set("session", await deps.auth.getSession(getCookie(c, SESSION_COOKIE)));
    const s = c.get("session");
    if (s?.refreshedUntil)
      setSession(c, getCookie(c, SESSION_COOKIE)!, s.refreshedUntil);
    await next();
    c.header("cache-control", "no-store");
  });

  app.onError((err, c) => {
    if (err instanceof AuthError)
      return c.json(
        { error: { code: err.code, message: err.message, field: err.field } },
        err.status
      );
    console.error(
      JSON.stringify({
        event: "web.error",
        error: String(err),
        stack: (err as Error).stack,
      })
    );
    return c.json(
      {
        error: {
          code: "internal_error",
          message: "Something went wrong. Try again.",
        },
      },
      500
    );
  });

  const body = async <T>(c: Context): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw new AuthError(400, "invalid_request", "Expected a JSON body.");
    }
  };
  const requireUser = (c: Context<Env>) => {
    const s = c.get("session");
    if (!s) throw new AuthError(401, "unauthorized", "Log in to continue.");
    return s;
  };
  const requireVerified = (c: Context<Env>) => {
    const s = requireUser(c);
    if (!s.user.emailVerifiedAt)
      throw new AuthError(
        403,
        "email_not_verified",
        "Verify your email to continue."
      );
    return s;
  };

  // ---------- Auth ----------

  app.get("/auth/me", (c) => {
    const s = c.get("session");
    return c.json({ user: s ? publicUser(s) : null });
  });

  app.post("/auth/signup", async (c) => {
    const b = await body<{ email?: string; password?: string; name?: string }>(
      c
    );
    const { session } = await deps.auth.signUp({
      email: b.email ?? "",
      password: b.password ?? "",
      name: b.name,
      ...meta(c),
    });
    setSession(c, session.token, session.expiresAt);
    return c.json({ ok: true }, 201);
  });

  app.post("/auth/login", async (c) => {
    const b = await body<{ email?: string; password?: string }>(c);
    const { session } = await deps.auth.logIn({
      email: b.email ?? "",
      password: b.password ?? "",
      ...meta(c),
    });
    setSession(c, session.token, session.expiresAt);
    return c.json({ ok: true });
  });

  app.post("/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await deps.auth.logOut(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure });
    return c.json({ ok: true });
  });

  app.post("/auth/verify-email", async (c) => {
    const b = await body<{ token?: string }>(c);
    await deps.auth.verifyEmail(b.token ?? "");
    return c.json({ ok: true });
  });

  app.post("/auth/resend-verification", async (c) => {
    await deps.auth.resendVerification(requireUser(c).user);
    return c.json({ ok: true });
  });

  app.post("/auth/forgot-password", async (c) => {
    const b = await body<{ email?: string }>(c);
    await deps.auth.requestPasswordReset({
      email: b.email ?? "",
      ip: meta(c).ip,
    });
    return c.json({ ok: true });
  });

  app.post("/auth/reset-password", async (c) => {
    const b = await body<{ token?: string; password?: string }>(c);
    const { session } = await deps.auth.resetPassword({
      token: b.token ?? "",
      password: b.password ?? "",
      ...meta(c),
    });
    setSession(c, session.token, session.expiresAt);
    return c.json({ ok: true });
  });

  app.post("/auth/change-password", async (c) => {
    const s = requireUser(c);
    const b = await body<{ current?: string; next?: string }>(c);
    await deps.auth.changePassword(s.user, {
      current: b.current ?? "",
      next: b.next ?? "",
      keepSessionId: s.sessionId,
    });
    return c.json({ ok: true });
  });

  app.patch("/auth/profile", async (c) => {
    const s = requireUser(c);
    const b = await body<{ name?: string | null }>(c);
    const user = await deps.auth.updateProfile(s.user, {
      name: b.name ?? null,
    });
    return c.json({ user: publicUser({ ...s, user }) });
  });

  app.post("/auth/workspace", async (c) => {
    const s = requireVerified(c);
    const b = await body<{ name?: string }>(c);
    const orgId = await deps.auth.createWorkspace(s.user, b.name ?? "");
    return c.json({ org_id: orgId });
  });

  app.post("/auth/onboarding/finish", async (c) => {
    await deps.auth.finishOnboarding(requireVerified(c).user);
    return c.json({ ok: true });
  });

  // ---------- API, as the signed-in user's workspace ----------

  app.all("/api/*", async (c) => {
    const s = requireVerified(c);
    if (!s.orgId)
      throw new AuthError(403, "no_workspace", "Create a workspace first.");
    const url = new URL(c.req.url);
    const target = new URL(
      url.pathname.replace(/^\/api/, "") + url.search,
      "https://api.internal"
    );
    const headers = new Headers(c.req.raw.headers);
    headers.delete("cookie"); // the API never sees dashboard cookies
    const forwarded = new Request(target, {
      method: c.req.method,
      headers,
      body: ["GET", "HEAD"].includes(c.req.method)
        ? undefined
        : await c.req.arrayBuffer(),
    });
    return deps.gateway(forwarded, s.orgId, s.user.id);
  });

  return app;
}
