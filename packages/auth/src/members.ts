import { schema } from "@send0/db";
import { and, asc, eq } from "drizzle-orm";
import type { AuthContext } from "./context";
import { AuthError, forbidden, notFound } from "./errors";
import { assignableRoles, can, canManageMember, type Role } from "./permissions";
import type { SessionService, User, Workspace } from "./sessions";

const { members, users } = schema;

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: Date;
}

/** People in a workspace: listing, changing roles, removing, leaving. */
export class MemberService {
  constructor(
    private readonly ctx: AuthContext,
    private readonly sessions: SessionService,
  ) {}

  list(orgId: string): Promise<Member[]> {
    return this.ctx.db
      .select({ userId: users.id, email: users.email, name: users.name, role: members.role, joinedAt: members.createdAt })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.orgId, orgId))
      .orderBy(asc(members.createdAt));
  }

  async changeRole(ws: Workspace, actor: User, targetUserId: string, role: Role): Promise<Member> {
    const target = await this.manageable(ws, actor, targetUserId);
    if (!(assignableRoles(ws.role) as Role[]).includes(role)) throw new AuthError(400, "invalid_role", "Choose admin or member.", "role");
    await this.ctx.db
      .update(members)
      .set({ role })
      .where(and(eq(members.orgId, ws.id), eq(members.userId, targetUserId)));
    return { ...target, role };
  }

  async remove(ws: Workspace, actor: User, targetUserId: string): Promise<void> {
    await this.manageable(ws, actor, targetUserId);
    await this.drop(ws.id, targetUserId);
  }

  /** Anyone but the owner can leave. The owner transfers ownership (or deletes the workspace) first. */
  async leave(ws: Workspace, user: User): Promise<void> {
    if (ws.role === "owner") throw new AuthError(400, "owner_cannot_leave", "Transfer ownership to an admin before you leave.");
    await this.drop(ws.id, user.id);
  }

  private async manageable(ws: Workspace, actor: User, targetUserId: string): Promise<Member> {
    if (!can(ws.role, "member.manage")) throw forbidden("Only owners and admins can manage members.");
    if (targetUserId === actor.id)
      throw new AuthError(400, "invalid_request", "You can't change your own role. Use “Leave workspace” instead.");
    const target = (await this.list(ws.id)).find((m) => m.userId === targetUserId);
    if (!target) throw notFound("member");
    if (!canManageMember(ws.role, target.role))
      throw forbidden(target.role === "owner" ? "Nobody can change the owner." : "Only the owner can change other admins.");
    return target;
  }

  private async drop(orgId: string, userId: string): Promise<void> {
    await this.ctx.db.delete(members).where(and(eq(members.orgId, orgId), eq(members.userId, userId)));
    await this.sessions.detachWorkspace(userId, orgId);
  }
}
