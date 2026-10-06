import { Hono } from "hono";
import { z } from "zod";
import type { WebEnv } from "../env";
import { clientMeta, ok, readBody, requireUser, requireWorkspace } from "../http";
import { setSessionCookie } from "../middleware/session";
import { inviteJson, workspaceJson } from "../serializers";

const role = z.enum(["admin", "member"]);

/** Inviting people, and accepting an invitation. Mounted at /auth/invites. */
export const inviteRoutes = new Hono<WebEnv>()
  .get("/", async (c) => {
    const s = requireWorkspace(c);
    return c.json({ data: (await c.get("deps").auth.invites.listPending(s.workspace)).map(inviteJson) });
  })

  .post("/", async (c) => {
    const s = requireWorkspace(c);
    const b = await readBody(c, z.object({ email: z.string().trim().min(1, "Enter an email address.").max(254), role }));
    return c.json(inviteJson(await c.get("deps").auth.invites.create(s.workspace, s.user, b)), 201);
  })

  .post("/:id/resend", async (c) => {
    const s = requireWorkspace(c);
    return c.json(inviteJson(await c.get("deps").auth.invites.resend(s.workspace, s.user, c.req.param("id"))));
  })

  .delete("/:id", async (c) => {
    const s = requireWorkspace(c);
    await c.get("deps").auth.invites.revoke(s.workspace, c.req.param("id"));
    return ok(c);
  })

  // ----- The invited person (token from the emailed link) -----

  .get("/token/:token", async (c) => {
    const p = await c.get("deps").auth.invites.preview(c.req.param("token"));
    return c.json({ workspace: p.workspace, email: p.email, role: p.role, invited_by: p.invitedBy, has_account: p.hasAccount });
  })

  .post("/token/:token/accept", async (c) => {
    const s = requireUser(c);
    return c.json(workspaceJson(await c.get("deps").auth.invites.accept(s.user, s.sessionId, c.req.param("token"))));
  })

  .post("/token/:token/signup", async (c) => {
    const b = await readBody(c, z.object({ password: z.string().min(1, "Enter a password.").max(200), name: z.string().trim().max(80).optional() }));
    const { session } = await c.get("deps").auth.invites.signUpAndAccept({ token: c.req.param("token"), ...b, ...clientMeta(c) });
    setSessionCookie(c, session.token, session.expiresAt);
    return ok(c, 201);
  });
