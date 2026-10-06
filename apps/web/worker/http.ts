import { AuthError, type SessionInfo, type Workspace } from "@send0/auth";
import type { Context } from "hono";
import type { z } from "zod";
import type { WebEnv } from "./env";

/** Parses and validates a JSON body. The first problem becomes a 400 that names its field. */
export async function readBody<S extends z.ZodType>(c: Context<WebEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AuthError(400, "invalid_request", "Expected a JSON body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new AuthError(400, "invalid_request", issue.message, issue.path.join(".") || undefined);
  }
  return parsed.data;
}

export const clientMeta = (c: Context) => ({
  ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  userAgent: c.req.header("user-agent") ?? null,
});

export function requireUser(c: Context<WebEnv>): SessionInfo {
  const s = c.get("session");
  if (!s) throw new AuthError(401, "unauthorized", "Log in to continue.");
  return s;
}

export function requireVerified(c: Context<WebEnv>): SessionInfo {
  const s = requireUser(c);
  if (!s.user.emailVerifiedAt) throw new AuthError(403, "email_not_verified", "Verify your email to continue.");
  return s;
}

/** The header the app sends with the workspace it's showing (see src/lib/active-workspace.ts). */
const WORKSPACE_HEADER = "x-send0-workspace";

/**
 * A verified user looking at a workspace. If the request says which workspace the page was
 * showing and the session has since moved on (another tab switched, or they were removed),
 * refuse rather than act on a workspace the person isn't looking at.
 */
export function requireWorkspace(c: Context<WebEnv>): SessionInfo & { workspace: Workspace } {
  const s = requireVerified(c);
  if (!s.workspace) throw new AuthError(403, "no_workspace", "Create or join a workspace first.");
  const expected = c.req.header(WORKSPACE_HEADER);
  if (expected && expected !== s.workspace.id) {
    throw new AuthError(409, "workspace_changed", "You switched workspace in another tab. This page has been refreshed.");
  }
  return s as SessionInfo & { workspace: Workspace };
}

export const ok = (c: Context, status: 200 | 201 = 200) => c.json({ ok: true }, status);
