import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import type { AuthContext } from "./context";
import type { Role } from "./permissions";
import { hashToken, randomToken } from "./tokens";

const { users, members, sessions, orgs } = schema;

export const SESSION_TTL_MS = 30 * 24 * 3600_000;
const SESSION_REFRESH_MS = 24 * 3600_000;

export type User = typeof users.$inferSelect;

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

export interface SessionInfo {
  user: User;
  sessionId: string;
  /** The workspace this session is looking at; null until the user has one */
  workspace: Workspace | null;
  /** Every workspace the user belongs to, oldest membership first */
  workspaces: Workspace[];
  /** Set when the cookie should be re-issued with a later expiry */
  refreshedUntil?: Date;
}

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Cookie sessions: issuing, resolving (with workspace), switching workspace, ending. */
export class SessionService {
  constructor(private readonly ctx: AuthContext) {}

  async create(userId: string, meta: SessionMeta = {}, orgId: string | null = null): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(this.ctx.now().getTime() + SESSION_TTL_MS);
    await this.ctx.db.insert(sessions).values({
      id: newId("ses"),
      userId,
      orgId,
      tokenHash: await hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
    return { token, expiresAt };
  }

  /** Resolves a session cookie. Slides the expiry at most once a day. */
  async resolve(token: string | undefined | null): Promise<SessionInfo | null> {
    if (!token) return null;
    const now = this.ctx.now();
    const [row] = await this.ctx.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, now)));
    if (!row) return null;

    let refreshedUntil: Date | undefined;
    if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
      refreshedUntil = new Date(now.getTime() + SESSION_TTL_MS);
      await this.ctx.db.update(sessions).set({ lastSeenAt: now, expiresAt: refreshedUntil }).where(eq(sessions.id, row.session.id));
    }
    const workspaces = await this.workspacesOf(row.user.id);
    const workspace = workspaces.find((w) => w.id === row.session.orgId) ?? workspaces[0] ?? null;
    return { user: row.user, sessionId: row.session.id, workspace, workspaces, refreshedUntil };
  }

  async workspacesOf(userId: string): Promise<Workspace[]> {
    return this.ctx.db
      .select({ id: orgs.id, name: orgs.name, role: members.role })
      .from(members)
      .innerJoin(orgs, eq(orgs.id, members.orgId))
      .where(and(eq(members.userId, userId), isNull(orgs.deletedAt)))
      .orderBy(asc(members.createdAt), asc(orgs.id));
  }

  async setWorkspace(sessionId: string, orgId: string): Promise<void> {
    await this.ctx.db.update(sessions).set({ orgId }).where(eq(sessions.id, sessionId));
  }

  /** Points the user's sessions on `orgId` back to their default workspace (after removal). */
  async detachWorkspace(userId: string, orgId: string): Promise<void> {
    await this.ctx.db.update(sessions).set({ orgId: null }).where(and(eq(sessions.userId, userId), eq(sessions.orgId, orgId)));
  }

  async end(token: string): Promise<void> {
    await this.ctx.db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  }

  /** Signs the user out everywhere, optionally keeping one session. */
  async endAll(userId: string, keepSessionId?: string): Promise<void> {
    await this.ctx.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), keepSessionId ? ne(sessions.id, keepSessionId) : undefined));
  }
}
