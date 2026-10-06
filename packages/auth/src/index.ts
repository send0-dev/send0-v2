import { AccountService } from "./accounts";
import { AuthContext, type AuthDeps } from "./context";
import { InviteService } from "./invites";
import { MemberService } from "./members";
import { SessionService } from "./sessions";
import { WorkspaceService } from "./workspaces";

export interface Auth {
  accounts: AccountService;
  sessions: SessionService;
  workspaces: WorkspaceService;
  members: MemberService;
  invites: InviteService;
}

/** Wires the dashboard's auth services around one database, clock and mailer. */
export function createAuth(deps: AuthDeps): Auth {
  const ctx = new AuthContext(deps);
  const sessions = new SessionService(ctx);
  const accounts = new AccountService(ctx, sessions);
  return {
    accounts,
    sessions,
    workspaces: new WorkspaceService(ctx, sessions),
    members: new MemberService(ctx, sessions),
    invites: new InviteService(ctx, sessions, accounts),
  };
}

export type { AuthDeps } from "./context";
export { AuthError } from "./errors";
export type { AccountService } from "./accounts";
export type { InviteService, InvitePreview, InviteRole, PendingInvite } from "./invites";
export type { Member, MemberService } from "./members";
export { SESSION_TTL_MS, type SessionInfo, type SessionMeta, type SessionService, type User, type Workspace } from "./sessions";
export type { WorkspaceService } from "./workspaces";
export * from "./permissions";
export { isDisposableEmail } from "./disposable";
export { hashPassword, verifyPassword, passwordProblem, PBKDF2_ITERATIONS } from "./password";
export { randomToken, hashToken } from "./tokens";
