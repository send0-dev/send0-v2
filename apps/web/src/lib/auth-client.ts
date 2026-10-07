import { workspaceHeaders } from "@/lib/active-workspace";
import { AppError } from "@/lib/api";
import type { Role } from "@send0/auth/permissions";

/** Calls the dashboard Worker's /auth/* endpoints (accounts, workspaces, members, invites). */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/auth${path}`, {
      method,
      credentials: "same-origin",
      headers: { ...workspaceHeaders(), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AppError(0, "network_error", "Can't reach send0. Check your connection and try again.");
  }
  const data = (res.headers.get("content-type")?.includes("json") ? await res.json() : null) as
    (T & { error?: { code?: string; message?: string; field?: string } }) | null;
  if (!res.ok) {
    const e = data?.error;
    throw new AppError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status}).`, e?.field ?? undefined);
  }
  return data as T;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  role: Role;
}

export interface Me {
  user: { id: string; email: string; name: string | null; email_verified: boolean; onboarded: boolean } | null;
  workspace: WorkspaceRef | null;
  workspaces: WorkspaceRef[];
}

export interface MemberRow {
  user_id: string;
  email: string;
  name: string | null;
  role: Role;
  joined_at: string;
}

export interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "member";
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface InvitePreview {
  workspace: string;
  email: string;
  role: "admin" | "member";
  invited_by: string | null;
  has_account: boolean;
}

type Ok = { ok: true };

export const authClient = {
  me: () => request<Me>("GET", "/me"),
  signUp: (b: { name?: string; email: string; password: string }) => request<Ok>("POST", "/signup", b),
  logIn: (b: { email: string; password: string }) => request<Ok>("POST", "/login", b),
  logOut: () => request<Ok>("POST", "/logout"),
  verifyEmail: (token: string) => request<Ok>("POST", "/verify-email", { token }),
  resendVerification: () => request<Ok>("POST", "/resend-verification"),
  forgotPassword: (email: string) => request<Ok>("POST", "/forgot-password", { email }),
  resetPassword: (b: { token: string; password: string }) => request<Ok>("POST", "/reset-password", b),
  changePassword: (b: { current: string; next: string }) => request<Ok>("POST", "/change-password", b),
  revokeOtherSessions: () => request<Ok>("POST", "/sessions/revoke-others"),
  updateProfile: (b: { name: string | null }) => request<Me>("PATCH", "/profile", b),
  finishOnboarding: () => request<Ok>("POST", "/onboarding/finish"),

  ensureFirstWorkspace: (name: string) => request<WorkspaceRef>("POST", "/workspace", { name }),
  createWorkspace: (name: string) => request<WorkspaceRef>("POST", "/workspaces", { name }),
  switchWorkspace: (id: string) => request<WorkspaceRef>("POST", `/workspaces/${encodeURIComponent(id)}/switch`),
  renameWorkspace: (name: string) => request<WorkspaceRef>("PATCH", "/workspace", { name }),
  transferWorkspace: (userId: string) => request<Ok>("POST", "/workspace/transfer", { user_id: userId }),
  deleteWorkspace: (confirm: string) => request<Ok>("DELETE", "/workspace", { confirm }),

  members: () => request<{ data: MemberRow[] }>("GET", "/members"),
  changeRole: (userId: string, role: "admin" | "member") => request<MemberRow>("PATCH", `/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (userId: string) => request<Ok>("DELETE", `/members/${encodeURIComponent(userId)}`),
  leaveWorkspace: () => request<Ok>("POST", "/members/leave"),

  invites: () => request<{ data: InviteRow[] }>("GET", "/invites"),
  invite: (b: { email: string; role: "admin" | "member" }) => request<InviteRow>("POST", "/invites", b),
  resendInvite: (id: string) => request<InviteRow>("POST", `/invites/${encodeURIComponent(id)}/resend`),
  revokeInvite: (id: string) => request<Ok>("DELETE", `/invites/${encodeURIComponent(id)}`),
  previewInvite: (token: string) => request<InvitePreview>("GET", `/invites/token/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) => request<WorkspaceRef>("POST", `/invites/token/${encodeURIComponent(token)}/accept`),
  signUpWithInvite: (token: string, b: { name?: string; password: string }) =>
    request<Ok>("POST", `/invites/token/${encodeURIComponent(token)}/signup`, b),
};
