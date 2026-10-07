import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthContext } from "./context";
import { AuthError, forbidden, notFound } from "./errors";
import { can } from "./permissions";
import type { SessionService, User, Workspace } from "./sessions";

const { orgs, members, apiKeys, webhooks, inboxes, invites } = schema;

function workspaceName(raw: string): string {
  const name = raw.trim();
  if (name.length < 2 || name.length > 60) throw new AuthError(400, "invalid_name", "Use 2–60 characters for the workspace name.", "name");
  return name;
}

/** Workspaces (orgs): creating, switching, renaming, transferring and deleting. */
export class WorkspaceService {
  constructor(
    private readonly ctx: AuthContext,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Onboarding's first step. Idempotent: if the user already has a workspace, it's renamed
   * instead, so going back and forth in onboarding never creates duplicates.
   */
  async ensureFirst(user: User, rawName: string, sessionId: string): Promise<Workspace> {
    this.requireVerified(user);
    const name = workspaceName(rawName);
    const [existing] = await this.sessions.workspacesOf(user.id);
    if (existing) {
      if (can(existing.role, "workspace.rename")) await this.ctx.db.update(orgs).set({ name }).where(eq(orgs.id, existing.id));
      await this.sessions.setWorkspace(sessionId, existing.id);
      return { ...existing, name: can(existing.role, "workspace.rename") ? name : existing.name };
    }
    return this.create(user, name, sessionId);
  }

  /** A new workspace with the user as owner. The session switches to it. */
  async create(user: User, rawName: string, sessionId: string): Promise<Workspace> {
    this.requireVerified(user);
    const name = workspaceName(rawName);
    await this.ctx.rateLimit("workspace:create", user.id, 10, 24 * 3600_000);
    const id = newId("org");
    await this.ctx.db.transaction(async (tx) => {
      await tx.insert(orgs).values({ id, name });
      await tx.insert(members).values({ orgId: id, userId: user.id, role: "owner" });
    });
    await this.sessions.setWorkspace(sessionId, id);
    return { id, name, role: "owner" };
  }

  async switchTo(userId: string, sessionId: string, orgId: string): Promise<Workspace> {
    const target = (await this.sessions.workspacesOf(userId)).find((w) => w.id === orgId);
    if (!target) throw notFound("workspace");
    await this.sessions.setWorkspace(sessionId, orgId);
    return target;
  }

  async rename(ws: Workspace, rawName: string): Promise<Workspace> {
    if (!can(ws.role, "workspace.rename")) throw forbidden("Only owners and admins can rename the workspace.");
    const name = workspaceName(rawName);
    await this.ctx.db.update(orgs).set({ name }).where(eq(orgs.id, ws.id));
    return { ...ws, name };
  }

  /** Makes an admin the owner; the current owner becomes an admin. */
  async transfer(ws: Workspace, owner: User, targetUserId: string): Promise<void> {
    if (!can(ws.role, "workspace.transfer")) throw forbidden("Only the owner can transfer the workspace.");
    if (targetUserId === owner.id) throw new AuthError(400, "invalid_request", "You already own this workspace.", "user_id");
    await this.ctx.db.transaction(async (tx) => {
      // Lock the owner's row and re-check it, so two transfers started at once can't both win.
      const [self] = await tx
        .select()
        .from(members)
        .where(and(eq(members.orgId, ws.id), eq(members.userId, owner.id)))
        .for("update");
      if (self?.role !== "owner") throw forbidden("Only the owner can transfer the workspace.");
      const [target] = await tx
        .select()
        .from(members)
        .where(and(eq(members.orgId, ws.id), eq(members.userId, targetUserId)))
        .for("update");
      if (!target) throw notFound("member");
      if (target.role !== "admin") throw new AuthError(400, "not_admin", "Make them an admin first, then transfer ownership.", "user_id");
      // Demote first: the database allows only one owner per workspace.
      await tx
        .update(members)
        .set({ role: "admin" })
        .where(and(eq(members.orgId, ws.id), eq(members.userId, owner.id)));
      await tx
        .update(members)
        .set({ role: "owner" })
        .where(and(eq(members.orgId, ws.id), eq(members.userId, targetUserId)));
    });
  }

  /**
   * Soft delete. Everything that could act for the workspace stops at once: keys are revoked,
   * webhooks disabled, inboxes closed (mail to them is refused) and open invites revoked.
   * The rows are purged after 30 days.
   */
  async delete(ws: Workspace, confirmName: string): Promise<void> {
    if (!can(ws.role, "workspace.delete")) throw forbidden("Only the owner can delete the workspace.");
    if (confirmName.trim() !== ws.name)
      throw new AuthError(400, "confirm_mismatch", "Type the workspace name exactly to confirm.", "confirm");
    const now = this.ctx.now();
    await this.ctx.db.transaction(async (tx) => {
      await tx.update(orgs).set({ deletedAt: now }).where(eq(orgs.id, ws.id));
      await tx
        .update(apiKeys)
        .set({ revokedAt: now })
        .where(and(eq(apiKeys.orgId, ws.id), isNull(apiKeys.revokedAt)));
      await tx.update(webhooks).set({ status: "disabled" }).where(eq(webhooks.orgId, ws.id));
      await tx
        .update(inboxes)
        .set({ deletedAt: now, status: "deleted" })
        .where(and(eq(inboxes.orgId, ws.id), isNull(inboxes.deletedAt)));
      await tx
        .update(invites)
        .set({ revokedAt: now })
        .where(and(eq(invites.orgId, ws.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));
    });
  }

  private requireVerified(user: User) {
    if (!user.emailVerifiedAt) throw new AuthError(403, "email_not_verified", "Verify your email first.");
  }
}
