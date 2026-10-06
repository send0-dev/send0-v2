import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { AccountService } from "./accounts";
import { EMAIL_RE, normalizeEmail, type AuthContext } from "./context";
import { inviteEmail } from "./emails";
import { AuthError, forbidden, notFound } from "./errors";
import { assignableRoles, can } from "./permissions";
import type { SessionMeta, SessionService, User, Workspace } from "./sessions";
import { hashToken, randomToken } from "./tokens";

const { invites, members, orgs, users } = schema;

export const INVITE_TTL_MS = 7 * 24 * 3600_000;
const INVITES_PER_DAY = 20;

type InviteRow = typeof invites.$inferSelect;
export type InviteRole = "admin" | "member";

export interface PendingInvite {
  id: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface InvitePreview {
  workspace: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  /** Whether an account already exists for the invited email (log in vs. sign up) */
  hasAccount: boolean;
}

const invalidInvite = () =>
  new AuthError(410, "invite_invalid", "This invitation is no longer valid. Ask for a new one.");

/** Inviting people to a workspace and accepting invitations. */
export class InviteService {
  constructor(
    private readonly ctx: AuthContext,
    private readonly sessions: SessionService,
    private readonly accounts: AccountService
  ) {}

  /** Open invitations. Only people who can manage members may see who's been invited. */
  async listPending(ws: Workspace): Promise<PendingInvite[]> {
    if (!can(ws.role, "member.manage")) throw forbidden("Only owners and admins can see invitations.");
    return this.ctx.db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        invitedBy: users.name,
        expiresAt: invites.expiresAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .leftJoin(users, eq(users.id, invites.invitedBy))
      .where(and(eq(invites.orgId, ws.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
      .orderBy(desc(invites.createdAt));
  }

  /** Invites `email` (replacing any open invite for it) and emails the link. */
  async create(ws: Workspace, inviter: User, input: { email: string; role: InviteRole }): Promise<PendingInvite> {
    if (!can(ws.role, "member.manage")) throw forbidden("Only owners and admins can invite people.");
    const email = normalizeEmail(input.email);
    if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError(400, "invalid_email", "Enter a valid email address.", "email");
    if (!assignableRoles(ws.role).includes(input.role)) throw new AuthError(400, "invalid_role", "Choose admin or member.", "role");
    const [already] = await this.ctx.db
      .select({ userId: members.userId })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.orgId, ws.id), sql`lower(${users.email}) = ${email}`));
    if (already) throw new AuthError(409, "already_member", `${email} is already in this workspace.`, "email");
    await this.ctx.rateLimit("invite:org", ws.id, INVITES_PER_DAY, 24 * 3600_000);

    const now = this.ctx.now();
    const token = randomToken();
    const row: typeof invites.$inferInsert = {
      id: newId("inv"),
      orgId: ws.id,
      email,
      role: input.role,
      tokenHash: await hashToken(token),
      invitedBy: inviter.id,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    };
    await this.ctx.db.transaction(async (tx) => {
      await this.revokeOpen(tx, ws.id, email, now);
      await tx.insert(invites).values(row);
    });
    try {
      await this.sendInvite(ws.name, inviter, email, input.role, token);
    } catch (err) {
      if (err instanceof AuthError && err.code === "email_failed") {
        throw new AuthError(502, "email_failed", `The invitation was saved, but the email to ${email} didn't send. Use “Resend invitation” to try again.`);
      }
      throw err;
    }
    return { id: row.id!, email, role: input.role, invitedBy: inviter.name, expiresAt: row.expiresAt, createdAt: now };
  }

  /** Re-sends with a fresh link and expiry. The old link stops working. */
  async resend(ws: Workspace, inviter: User, inviteId: string): Promise<PendingInvite> {
    const invite = await this.openInvite(ws, inviteId);
    return this.create(ws, inviter, { email: invite.email, role: invite.role });
  }

  async revoke(ws: Workspace, inviteId: string): Promise<void> {
    const invite = await this.openInvite(ws, inviteId);
    await this.ctx.db.update(invites).set({ revokedAt: this.ctx.now() }).where(eq(invites.id, invite.id));
  }

  /** What the invite page shows before anyone logs in. */
  async preview(token: string): Promise<InvitePreview> {
    const { invite, workspace, inviter } = await this.byToken(token);
    return {
      workspace,
      email: invite.email,
      role: invite.role,
      invitedBy: inviter,
      hasAccount: !!(await this.accounts.findByEmail(invite.email)),
    };
  }

  /** A signed-in user accepts. Their email must match the invite; the session switches to the workspace. */
  async accept(user: User, sessionId: string, token: string): Promise<Workspace> {
    const { invite, workspace } = await this.byToken(token);
    if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
      throw new AuthError(403, "wrong_account", `This invitation is for ${invite.email}. Log out and sign in with that address.`);
    }
    await this.join(invite, user);
    // The link went to this address, which proves the person controls it.
    await this.accounts.markVerified(user);
    await this.accounts.finishOnboarding(user);
    await this.sessions.setWorkspace(sessionId, invite.orgId);
    return { id: invite.orgId, name: workspace, role: invite.role };
  }

  /** Someone without an account signs up through the invite. The email is fixed to the invited address. */
  async signUpAndAccept(input: { token: string; password: string; name?: string } & SessionMeta) {
    const { invite } = await this.byToken(input.token);
    const email = await this.accounts.checkNewAccount(invite.email, input.password);
    const user = await this.accounts.createUser({ email, password: input.password, name: input.name, verified: true, onboarded: true });
    await this.join(invite, user);
    const session = await this.sessions.create(user.id, input, invite.orgId);
    return { user, session };
  }

  private async join(invite: InviteRow, user: User): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invites)
        .set({ acceptedAt: this.ctx.now() })
        .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
        .returning({ id: invites.id });
      if (!claimed) throw invalidInvite();
      await tx.insert(members).values({ orgId: invite.orgId, userId: user.id, role: invite.role }).onConflictDoNothing();
    });
  }

  private async byToken(token: string): Promise<{ invite: InviteRow; workspace: string; inviter: string | null }> {
    if (!token) throw invalidInvite();
    const [row] = await this.ctx.db
      .select({ invite: invites, workspace: orgs.name, inviter: users.name, inviterEmail: users.email })
      .from(invites)
      .innerJoin(orgs, eq(orgs.id, invites.orgId))
      .leftJoin(users, eq(users.id, invites.invitedBy))
      .where(
        and(
          eq(invites.tokenHash, await hashToken(token)),
          isNull(invites.acceptedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, this.ctx.now()),
          isNull(orgs.deletedAt)
        )
      );
    if (!row) throw invalidInvite();
    return { invite: row.invite, workspace: row.workspace, inviter: row.inviter ?? row.inviterEmail };
  }

  private async openInvite(ws: Workspace, inviteId: string): Promise<InviteRow> {
    if (!can(ws.role, "member.manage")) throw forbidden("Only owners and admins can manage invitations.");
    const [invite] = await this.ctx.db
      .select()
      .from(invites)
      .where(and(eq(invites.id, inviteId), eq(invites.orgId, ws.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));
    if (!invite) throw notFound("invitation");
    return invite;
  }

  private async revokeOpen(tx: Parameters<Parameters<AuthContext["db"]["transaction"]>[0]>[0], orgId: string, email: string, now: Date) {
    await tx
      .update(invites)
      .set({ revokedAt: now })
      .where(and(eq(invites.orgId, orgId), sql`lower(${invites.email}) = ${email}`, isNull(invites.acceptedAt), isNull(invites.revokedAt)));
  }

  private async sendInvite(workspace: string, inviter: User, email: string, role: InviteRole, token: string) {
    await this.ctx.sendEmail(
      email,
      inviteEmail({ inviter: inviter.name ?? inviter.email, workspace, role, link: this.ctx.link(`/invite/${token}`) })
    );
  }
}
