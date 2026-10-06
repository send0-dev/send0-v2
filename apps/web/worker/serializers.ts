import type { Member, PendingInvite, SessionInfo, Workspace } from "@send0/auth";

export const workspaceJson = (w: Workspace) => ({ id: w.id, name: w.name, role: w.role });

/** Everything the app needs to know about who is signed in. */
export const meJson = (s: SessionInfo | null) =>
  s
    ? {
        user: {
          id: s.user.id,
          email: s.user.email,
          name: s.user.name,
          email_verified: !!s.user.emailVerifiedAt,
          onboarded: !!s.user.onboardedAt,
        },
        workspace: s.workspace && workspaceJson(s.workspace),
        workspaces: s.workspaces.map(workspaceJson),
      }
    : { user: null, workspace: null, workspaces: [] };

export const memberJson = (m: Member) => ({
  user_id: m.userId,
  email: m.email,
  name: m.name,
  role: m.role,
  joined_at: m.joinedAt.toISOString(),
});

export const inviteJson = (i: PendingInvite) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  invited_by: i.invitedBy,
  expires_at: i.expiresAt.toISOString(),
  created_at: i.createdAt.toISOString(),
});
