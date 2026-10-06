/** The three access levels the dashboard offers, mapped to API scopes. */
export const ACCESS_LEVELS = {
  send: { label: "Send and read", scopes: ["read", "send"], description: "For agents: read mail, wait, send and reply." },
  read: { label: "Read only", scopes: ["read"], description: "Read inboxes, threads and messages. Can't send." },
  admin: { label: "Full access", scopes: ["admin"], description: "Everything, including inboxes, keys and webhooks." },
} as const;

export type AccessLevel = keyof typeof ACCESS_LEVELS;

export function accessLevelOf(scopes: string[]): AccessLevel {
  if (scopes.includes("admin")) return "admin";
  return scopes.includes("send") ? "send" : "read";
}
