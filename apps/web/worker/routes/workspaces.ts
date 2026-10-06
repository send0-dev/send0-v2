import { Hono } from "hono";
import { z } from "zod";
import type { WebEnv } from "../env";
import { ok, readBody, requireVerified, requireWorkspace } from "../http";
import { workspaceJson } from "../serializers";

const name = z.string().trim().min(2, "Use 2–60 characters.").max(60, "Use 2–60 characters.");

/** Workspaces: onboarding's first one, more, switching, renaming, transfer and deletion. Mounted at /auth. */
export const workspaceRoutes = new Hono<WebEnv>()
  /** Onboarding step 1. Idempotent. */
  .post("/workspace", async (c) => {
    const s = requireVerified(c);
    const b = await readBody(c, z.object({ name }));
    return c.json(workspaceJson(await c.get("deps").auth.workspaces.ensureFirst(s.user, b.name, s.sessionId)));
  })

  .post("/workspaces", async (c) => {
    const s = requireVerified(c);
    const b = await readBody(c, z.object({ name }));
    return c.json(workspaceJson(await c.get("deps").auth.workspaces.create(s.user, b.name, s.sessionId)), 201);
  })

  .post("/workspaces/:id/switch", async (c) => {
    const s = requireVerified(c);
    return c.json(workspaceJson(await c.get("deps").auth.workspaces.switchTo(s.user.id, s.sessionId, c.req.param("id"))));
  })

  .patch("/workspace", async (c) => {
    const s = requireWorkspace(c);
    const b = await readBody(c, z.object({ name }));
    return c.json(workspaceJson(await c.get("deps").auth.workspaces.rename(s.workspace, b.name)));
  })

  .post("/workspace/transfer", async (c) => {
    const s = requireWorkspace(c);
    const b = await readBody(c, z.object({ user_id: z.string().min(1).max(40) }));
    await c.get("deps").auth.workspaces.transfer(s.workspace, s.user, b.user_id);
    return ok(c);
  })

  .delete("/workspace", async (c) => {
    const s = requireWorkspace(c);
    const b = await readBody(c, z.object({ confirm: z.string().max(60) }));
    await c.get("deps").auth.workspaces.delete(s.workspace, b.confirm);
    return ok(c);
  });
