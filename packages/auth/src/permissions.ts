/**
 * Who may do what in a workspace. Pure and dependency-free: the dashboard Worker enforces it,
 * and the React app imports the same table to hide what a role can't use.
 */

export type Role = "owner" | "admin" | "member";
export const ROLES: readonly Role[] = ["owner", "admin", "member"];

export type Action =
  | "mail.read" // inboxes, threads, messages, drafts, usage, live events
  | "mail.send" // send, reply, forward
  | "draft.edit"
  | "draft.decide" // approve or reject
  | "inbox.manage" // create, update, delete inboxes
  | "key.manage"
  | "webhook.manage"
  | "member.manage" // invite, change roles, remove
  | "workspace.rename"
  | "workspace.delete"
  | "workspace.transfer";

const EVERYONE: readonly Role[] = ROLES;
const ADMINS: readonly Role[] = ["owner", "admin"];
const OWNER: readonly Role[] = ["owner"];

const ALLOWED: Record<Action, readonly Role[]> = {
  "mail.read": EVERYONE,
  "mail.send": EVERYONE,
  "draft.edit": EVERYONE,
  "draft.decide": EVERYONE,
  "inbox.manage": ADMINS,
  "key.manage": ADMINS,
  "webhook.manage": ADMINS,
  "member.manage": ADMINS,
  "workspace.rename": ADMINS,
  "workspace.delete": OWNER,
  "workspace.transfer": OWNER,
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && ALLOWED[action].includes(role);
}

/**
 * Whether `actor` may change or remove `target`. Admins manage members only;
 * the owner manages everyone. Nobody manages themselves here (use "leave").
 */
export function canManageMember(actor: Role, target: Role): boolean {
  if (actor === "owner") return target !== "owner";
  if (actor === "admin") return target === "member";
  return false;
}

/** Roles `actor` may hand out when inviting or changing someone's role. */
export function assignableRoles(actor: Role): ("admin" | "member")[] {
  return actor === "owner" || actor === "admin" ? ["admin", "member"] : [];
}

/** API scopes the dashboard acts with for a role (the API's own check after ours). */
export function apiScopesFor(role: Role): ("read" | "send" | "admin")[] {
  return role === "member" ? ["read", "send"] : ["admin"];
}

type Rule = [method: string, pattern: RegExp, action: Action];

const ID = "[A-Za-z0-9_]+";
/** First match wins. Anything unmatched is refused, so new API routes must be added here. */
const API_RULES: Rule[] = [
  ["*", /^\/v1\/api-keys(\/.*)?$/, "key.manage"],
  ["*", /^\/v1\/webhooks(\/.*)?$/, "webhook.manage"],
  ["POST", new RegExp(`^/v1/inboxes/${ID}/messages$`), "mail.send"],
  ["POST", new RegExp(`^/v1/messages/${ID}/(reply|forward)$`), "mail.send"],
  ["PATCH", new RegExp(`^/v1/drafts/${ID}$`), "draft.edit"],
  ["POST", new RegExp(`^/v1/drafts/${ID}/(send|reject)$`), "draft.decide"],
  ["POST", /^\/v1\/inboxes$/, "inbox.manage"],
  ["PATCH", new RegExp(`^/v1/inboxes/${ID}$`), "inbox.manage"],
  ["DELETE", new RegExp(`^/v1/inboxes/${ID}$`), "inbox.manage"],
  ["GET", /^\/v1\/(inboxes|messages|drafts|usage|stats|events)(\/.*)?$/, "mail.read"],
];

/** The action an API request needs, or null if the dashboard doesn't allow it at all. */
export function apiAction(method: string, path: string): Action | null {
  const m = method.toUpperCase();
  for (const [ruleMethod, pattern, action] of API_RULES) {
    if ((ruleMethod === "*" || ruleMethod === m) && pattern.test(path)) return action;
  }
  return null;
}
