import type { Auth, SessionInfo } from "@send0/auth";

/** The API's private entrypoint: runs the real API as a workspace, with the given scopes. */
export type Gateway = (request: Request, as: { orgId: string; userId: string; scopes: ("read" | "send" | "admin")[] }) => Promise<Response>;

export interface WebDeps {
  auth: Auth;
  gateway: Gateway;
  /** e.g. https://app.send0.dev: the only origin allowed to change state */
  appUrl: string;
  /** false only in local dev over http */
  secureCookies?: boolean;
}

export type WebEnv = { Variables: { deps: WebDeps; session: SessionInfo | null } };
