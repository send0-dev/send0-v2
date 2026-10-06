import type { Mailer } from "@send0/adapters/mailer";
import { buildMime, newId, rfcMessageId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { isDisposableEmail } from "./disposable";
import {
  resetPasswordEmail,
  verifyEmail as verifyEmailTemplate,
  passwordChangedEmail,
} from "./emails";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { hashToken, randomToken } from "./tokens";

const { users, members, sessions, authTokens, rateLimits, orgs } = schema;

export const SESSION_TTL_MS = 30 * 24 * 3600_000;
const SESSION_REFRESH_MS = 24 * 3600_000;
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;

export class AuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly code: string,
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

export interface AuthDeps {
  db: Db;
  mailer?: Mailer;
  /** e.g. "send0 <noreply@send0.dev>" */
  from: { name: string; email: string };
  /** Base URL for links in emails, e.g. https://app.send0.dev */
  appUrl: string;
  now?: () => Date;
}

export type User = typeof users.$inferSelect;
export interface SessionInfo {
  user: User;
  sessionId: string;
  orgId: string | null;
  orgName: string | null;
  /** Set when the cookie should be re-issued with a later expiry */
  refreshedUntil?: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AuthDeps) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** Fixed-window limiter. Throws 429 once `limit` is passed within `windowMs`. */
  async rateLimit(
    name: string,
    id: string,
    limit: number,
    windowMs: number
  ): Promise<void> {
    const now = this.now();
    const window = Math.floor(now.getTime() / windowMs);
    const key = `${name}:${id}:${window}`;
    const [row] = await this.deps.db
      .insert(rateLimits)
      .values({ key, count: 1, expiresAt: new Date((window + 1) * windowMs) })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    if (row && row.count > limit) {
      throw new AuthError(
        429,
        "rate_limited",
        "Too many attempts. Wait a few minutes and try again."
      );
    }
    // Opportunistic cleanup of old windows.
    if (Math.random() < 0.02)
      await this.deps.db
        .delete(rateLimits)
        .where(lt(rateLimits.expiresAt, now));
  }

  private async issueToken(
    userId: string,
    purpose: "verify_email" | "reset_password",
    ttlMs: number
  ): Promise<string> {
    const token = randomToken();
    // One live token per purpose: issuing a new link invalidates older ones.
    await this.deps.db
      .update(authTokens)
      .set({ usedAt: this.now() })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt)
        )
      );
    await this.deps.db
      .insert(authTokens)
      .values({
        tokenHash: await hashToken(token),
        userId,
        purpose,
        expiresAt: new Date(this.now().getTime() + ttlMs),
      });
    return token;
  }

  private async consumeToken(
    token: string,
    purpose: "verify_email" | "reset_password"
  ): Promise<string> {
    const [row] = await this.deps.db
      .update(authTokens)
      .set({ usedAt: this.now() })
      .where(
        and(
          eq(authTokens.tokenHash, await hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, this.now())
        )
      )
      .returning({ userId: authTokens.userId });
    if (!row) {
      throw new AuthError(
        400,
        "invalid_token",
        purpose === "verify_email"
          ? "This verification link is invalid or has expired. Request a new one."
          : "This reset link is invalid or has expired. Request a new one."
      );
    }
    return row.userId;
  }

  private async send(
    to: string,
    mail: { subject: string; text: string; html: string }
  ): Promise<void> {
    if (!this.deps.mailer) {
      console.log(
        JSON.stringify({
          event: "auth.email_skipped",
          to,
          subject: mail.subject,
        })
      );
      return;
    }
    const id = newId("msg");
    const domain = this.deps.from.email.split("@")[1]!;
    await this.deps.mailer.sendRaw({
      from: this.deps.from.email,
      recipients: [to],
      raw: buildMime({
        from: this.deps.from,
        to: [{ email: to }],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: rfcMessageId(id, domain),
        date: this.now(),
      }),
      tags: { kind: "system" },
    });
  }

  async createSession(
    userId: string,
    meta: { ip?: string | null; userAgent?: string | null } = {}
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    await this.deps.db.insert(sessions).values({
      id: newId("ses"),
      userId,
      tokenHash: await hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
    return { token, expiresAt };
  }

  async signUp(input: {
    email: string;
    password: string;
    name?: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const email = normalizeEmail(input.email);
    if (!EMAIL_RE.test(email) || email.length > 254)
      throw new AuthError(
        400,
        "invalid_email",
        "Enter a valid email address.",
        "email"
      );
    if (isDisposableEmail(email))
      throw new AuthError(
        400,
        "disposable_email",
        "Use your work or personal email. Temporary email addresses aren't accepted.",
        "email"
      );
    const problem = passwordProblem(input.password, email);
    if (problem) throw new AuthError(400, "weak_password", problem, "password");
    if (input.ip) await this.rateLimit("signup:ip", input.ip, 5, 3600_000);

    const [existing] = await this.deps.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (existing)
      throw new AuthError(
        409,
        "email_taken",
        "An account with this email already exists. Log in, or reset your password.",
        "email"
      );

    const [user] = await this.deps.db
      .insert(users)
      .values({
        id: newId("usr"),
        email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
      })
      .onConflictDoNothing()
      .returning();
    if (!user)
      throw new AuthError(
        409,
        "email_taken",
        "An account with this email already exists. Log in, or reset your password.",
        "email"
      );

    await this.sendVerification(user);
    const session = await this.createSession(user.id, {
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { user, session };
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.issueToken(user.id, "verify_email", VERIFY_TTL_MS);
    await this.send(
      user.email,
      verifyEmailTemplate({
        name: user.name,
        link: `${this.deps.appUrl}/verify-email?token=${token}`,
      })
    );
  }

  async resendVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.rateLimit("verify:user", user.id, 3, 3600_000);
    await this.sendVerification(user);
  }

  async verifyEmail(token: string): Promise<User> {
    const userId = await this.consumeToken(token, "verify_email");
    const [user] = await this.deps.db
      .update(users)
      .set({ emailVerifiedAt: this.now() })
      .where(eq(users.id, userId))
      .returning();
    return user!;
  }

  async logIn(input: {
    email: string;
    password: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const email = normalizeEmail(input.email);
    if (input.ip) await this.rateLimit("login:ip", input.ip, 30, 15 * 60_000);
    await this.rateLimit("login:email", email, 10, 15 * 60_000);

    const [user] = await this.deps.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    // Same work either way, so response time doesn't reveal which emails have accounts.
    this.dummyHash ??= hashPassword("not-a-real-password");
    const ok = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash)
    );
    if (!user || !ok)
      throw new AuthError(
        401,
        "invalid_credentials",
        "Email or password is incorrect."
      );

    const session = await this.createSession(user.id, {
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { user, session };
  }

  async logOut(token: string): Promise<void> {
    await this.deps.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, await hashToken(token)));
  }

  /** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
  async requestPasswordReset(input: {
    email: string;
    ip?: string | null;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    if (input.ip) await this.rateLimit("reset:ip", input.ip, 10, 3600_000);
    await this.rateLimit("reset:email", email, 3, 3600_000);
    const [user] = await this.deps.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (!user) return;
    const token = await this.issueToken(
      user.id,
      "reset_password",
      RESET_TTL_MS
    );
    await this.send(
      user.email,
      resetPasswordEmail({
        name: user.name,
        link: `${this.deps.appUrl}/reset-password?token=${token}`,
      })
    );
  }

  async resetPassword(input: {
    token: string;
    password: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const [pending] = await this.deps.db
      .select({ user: users })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(
        and(
          eq(authTokens.tokenHash, await hashToken(input.token)),
          eq(authTokens.purpose, "reset_password")
        )
      );
    const problem = passwordProblem(input.password, pending?.user.email);
    if (problem) throw new AuthError(400, "weak_password", problem, "password");

    const userId = await this.consumeToken(input.token, "reset_password");
    // Clicking the emailed link proves control of the inbox, so it also verifies the email.
    const [user] = await this.deps.db
      .update(users)
      .set({
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      })
      .where(eq(users.id, userId))
      .returning();
    await this.deps.db.delete(sessions).where(eq(sessions.userId, userId)); // sign out everywhere
    await this.send(
      user!.email,
      passwordChangedEmail({ name: user!.name, appUrl: this.deps.appUrl })
    );
    const session = await this.createSession(userId, {
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { user: user!, session };
  }

  async changePassword(
    user: User,
    input: { current: string; next: string; keepSessionId: string }
  ) {
    if (!(await verifyPassword(input.current, user.passwordHash))) {
      throw new AuthError(
        400,
        "invalid_credentials",
        "Your current password is incorrect.",
        "current"
      );
    }
    const problem = passwordProblem(input.next, user.email);
    if (problem) throw new AuthError(400, "weak_password", problem, "next");
    await this.deps.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.next) })
      .where(eq(users.id, user.id));
    // Other devices are signed out; this one stays.
    await this.deps.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, user.id),
          sql`${sessions.id} <> ${input.keepSessionId}`
        )
      );
    await this.send(
      user.email,
      passwordChangedEmail({ name: user.name, appUrl: this.deps.appUrl })
    );
  }

  /** Resolves a session cookie. Slides the expiry at most once a day. */
  async getSession(
    token: string | undefined | null
  ): Promise<SessionInfo | null> {
    if (!token) return null;
    const [row] = await this.deps.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, await hashToken(token)),
          gt(sessions.expiresAt, this.now())
        )
      );
    if (!row) return null;

    let refreshedUntil: Date | undefined;
    if (
      this.now().getTime() - row.session.lastSeenAt.getTime() >
      SESSION_REFRESH_MS
    ) {
      refreshedUntil = new Date(this.now().getTime() + SESSION_TTL_MS);
      await this.deps.db
        .update(sessions)
        .set({ lastSeenAt: this.now(), expiresAt: refreshedUntil })
        .where(eq(sessions.id, row.session.id));
    }
    const [membership] = await this.deps.db
      .select({ orgId: members.orgId, orgName: orgs.name })
      .from(members)
      .innerJoin(orgs, eq(orgs.id, members.orgId))
      .where(eq(members.userId, row.user.id))
      .limit(1);
    return {
      user: row.user,
      sessionId: row.session.id,
      orgId: membership?.orgId ?? null,
      orgName: membership?.orgName ?? null,
      refreshedUntil,
    };
  }

  /** Onboarding step 1: name the workspace. Idempotent: returns the existing org if there is one. */
  async createWorkspace(user: User, name: string): Promise<string> {
    if (!user.emailVerifiedAt)
      throw new AuthError(
        403,
        "email_not_verified",
        "Verify your email first."
      );
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60)
      throw new AuthError(
        400,
        "invalid_name",
        "Use 2–60 characters for the workspace name.",
        "name"
      );
    const [existing] = await this.deps.db
      .select({ orgId: members.orgId })
      .from(members)
      .where(eq(members.userId, user.id))
      .limit(1);
    if (existing) {
      await this.deps.db
        .update(orgs)
        .set({ name: trimmed })
        .where(eq(orgs.id, existing.orgId));
      return existing.orgId;
    }
    const orgId = newId("org");
    await this.deps.db.transaction(async (tx) => {
      await tx.insert(orgs).values({ id: orgId, name: trimmed });
      await tx
        .insert(members)
        .values({ orgId, userId: user.id, role: "owner" });
    });
    return orgId;
  }

  async finishOnboarding(user: User): Promise<void> {
    await this.deps.db
      .update(users)
      .set({ onboardedAt: this.now() })
      .where(and(eq(users.id, user.id), isNull(users.onboardedAt)));
  }

  async updateProfile(
    user: User,
    input: { name?: string | null }
  ): Promise<User> {
    const [u] = await this.deps.db
      .update(users)
      .set({ name: input.name?.trim() || null })
      .where(eq(users.id, user.id))
      .returning();
    return u!;
  }
}
