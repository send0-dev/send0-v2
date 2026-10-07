import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { EMAIL_RE, normalizeEmail, type AuthContext } from "./context";
import { isDisposableEmail } from "./disposable";
import { passwordChangedEmail, resetPasswordEmail, verifyEmail as verifyEmailTemplate } from "./emails";
import { AuthError } from "./errors";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import type { SessionMeta, SessionService, User } from "./sessions";
import { hashToken, randomToken } from "./tokens";

const { users, authTokens } = schema;

const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;

type TokenPurpose = "verify_email" | "reset_password";

const emailTaken = () =>
  new AuthError(409, "email_taken", "An account with this email already exists. Log in, or reset your password.", "email");

/** A person's account: sign-up, email verification, login, passwords and profile. */
export class AccountService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly ctx: AuthContext,
    private readonly sessions: SessionService,
  ) {}

  /** Validates and normalizes a new account's email and password. */
  async checkNewAccount(rawEmail: string, password: string): Promise<string> {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError(400, "invalid_email", "Enter a valid email address.", "email");
    if (isDisposableEmail(email))
      throw new AuthError(400, "disposable_email", "Use your work or personal email. Temporary email addresses aren't accepted.", "email");
    const problem = passwordProblem(password, email);
    if (problem) throw new AuthError(400, "weak_password", problem, "password");
    if (await this.findByEmail(email)) throw emailTaken();
    return email;
  }

  /**
   * Inserts the user row. `verified` is for flows that already proved the email, and `onboarded`
   * for people who join an existing workspace instead of setting up their own (both: invites).
   */
  async createUser(input: {
    email: string;
    password: string;
    name?: string | null;
    verified?: boolean;
    onboarded?: boolean;
  }): Promise<User> {
    const [user] = await this.ctx.db
      .insert(users)
      .values({
        id: newId("usr"),
        email: input.email,
        name: input.name?.trim() || null,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: input.verified ? this.ctx.now() : null,
        onboardedAt: input.onboarded ? this.ctx.now() : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!user) throw emailTaken();
    return user;
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.ctx.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
      .then((r) => r[0]);
  }

  /** Whether someone can create an account without an invite. */
  async signupOpen(): Promise<boolean> {
    if (this.ctx.deps.allowSignup ?? true) return true;
    const [existing] = await this.ctx.db.select({ id: users.id }).from(users).limit(1);
    return !existing;
  }

  async signUp(input: { email: string; password: string; name?: string } & SessionMeta) {
    if (input.ip) await this.ctx.rateLimit("signup:ip", input.ip, 5, 3600_000);
    if (!(await this.signupOpen())) {
      throw new AuthError(403, "signup_closed", "Sign-up is closed here. Ask a workspace owner to invite you.");
    }
    const email = await this.checkNewAccount(input.email, input.password);
    const user = await this.createUser({ email, password: input.password, name: input.name });
    await this.sendVerification(user).catch(() => {});
    const session = await this.sessions.create(user.id, input);
    return { user, session };
  }

  async resendVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.ctx.rateLimit("verify:user", user.id, 3, 3600_000);
    await this.sendVerification(user);
  }

  async verifyEmail(token: string): Promise<User> {
    const userId = await this.consumeToken(token, "verify_email");
    const [user] = await this.ctx.db.update(users).set({ emailVerifiedAt: this.ctx.now() }).where(eq(users.id, userId)).returning();
    return user!;
  }

  /** Marks the email verified because the person proved control of it another way (an invite link). */
  async markVerified(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.ctx.db.update(users).set({ emailVerifiedAt: this.ctx.now() }).where(eq(users.id, user.id));
  }

  async logIn(input: { email: string; password: string } & SessionMeta) {
    const email = normalizeEmail(input.email);
    if (input.ip) await this.ctx.rateLimit("login:ip", input.ip, 30, 15 * 60_000);
    await this.ctx.rateLimit("login:email", email, 10, 15 * 60_000);
    const user = await this.findByEmail(email);
    // Same work either way, so response time doesn't reveal which emails have accounts.
    this.dummyHash ??= hashPassword("not-a-real-password");
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !ok) throw new AuthError(401, "invalid_credentials", "Email or password is incorrect.");
    const session = await this.sessions.create(user.id, input);
    return { user, session };
  }

  /** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
  async requestPasswordReset(input: { email: string; ip?: string | null }): Promise<void> {
    const email = normalizeEmail(input.email);
    if (input.ip) await this.ctx.rateLimit("reset:ip", input.ip, 10, 3600_000);
    await this.ctx.rateLimit("reset:email", email, 3, 3600_000);
    const user = await this.findByEmail(email);
    if (!user) return;
    const token = await this.issueToken(user.id, "reset_password", RESET_TTL_MS);
    // Never fails visibly: a failure only for existing accounts would reveal which emails have one.
    await this.ctx.trySendEmail(user.email, resetPasswordEmail({ name: user.name, link: this.ctx.link(`/reset-password?token=${token}`) }));
  }

  async resetPassword(input: { token: string; password: string } & SessionMeta) {
    const [pending] = await this.ctx.db
      .select({ user: users })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(and(eq(authTokens.tokenHash, await hashToken(input.token)), eq(authTokens.purpose, "reset_password")));
    const problem = passwordProblem(input.password, pending?.user.email);
    if (problem) throw new AuthError(400, "weak_password", problem, "password");

    const userId = await this.consumeToken(input.token, "reset_password");
    // Clicking the emailed link proves control of the inbox, so it also verifies the email.
    const [user] = await this.ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, userId))
      .returning();
    await this.sessions.endAll(userId);
    await this.ctx.trySendEmail(user!.email, passwordChangedEmail({ name: user!.name, appUrl: this.ctx.deps.appUrl }));
    const session = await this.sessions.create(userId, input);
    return { user: user!, session };
  }

  async changePassword(user: User, input: { current: string; next: string; keepSessionId: string }): Promise<void> {
    if (!(await verifyPassword(input.current, user.passwordHash)))
      throw new AuthError(400, "invalid_credentials", "Your current password is incorrect.", "current");
    const problem = passwordProblem(input.next, user.email);
    if (problem) throw new AuthError(400, "weak_password", problem, "next");
    await this.ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.next) })
      .where(eq(users.id, user.id));
    await this.sessions.endAll(user.id, input.keepSessionId); // other devices are signed out; this one stays
    await this.ctx.trySendEmail(user.email, passwordChangedEmail({ name: user.name, appUrl: this.ctx.deps.appUrl }));
  }

  async updateProfile(user: User, input: { name?: string | null }): Promise<User> {
    const name = input.name?.trim() || null;
    if (name && name.length > 80) throw new AuthError(400, "invalid_name", "Use at most 80 characters.", "name");
    const [u] = await this.ctx.db.update(users).set({ name }).where(eq(users.id, user.id)).returning();
    return u!;
  }

  async finishOnboarding(user: User): Promise<void> {
    await this.ctx.db
      .update(users)
      .set({ onboardedAt: this.ctx.now() })
      .where(and(eq(users.id, user.id), isNull(users.onboardedAt)));
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.issueToken(user.id, "verify_email", VERIFY_TTL_MS);
    await this.ctx.sendEmail(user.email, verifyEmailTemplate({ name: user.name, link: this.ctx.link(`/verify-email?token=${token}`) }));
  }

  private async issueToken(userId: string, purpose: TokenPurpose, ttlMs: number): Promise<string> {
    const token = randomToken();
    const now = this.ctx.now();
    // One live token per purpose: issuing a new link invalidates older ones.
    await this.ctx.db
      .update(authTokens)
      .set({ usedAt: now })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
    await this.ctx.db
      .insert(authTokens)
      .values({ tokenHash: await hashToken(token), userId, purpose, expiresAt: new Date(now.getTime() + ttlMs) });
    return token;
  }

  private async consumeToken(token: string, purpose: TokenPurpose): Promise<string> {
    const now = this.ctx.now();
    const [row] = await this.ctx.db
      .update(authTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(authTokens.tokenHash, await hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, now),
        ),
      )
      .returning({ userId: authTokens.userId });
    if (!row) {
      throw new AuthError(
        400,
        "invalid_token",
        purpose === "verify_email"
          ? "This verification link is invalid or has expired. Request a new one."
          : "This reset link is invalid or has expired. Request a new one.",
      );
    }
    return row.userId;
  }
}
