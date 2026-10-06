import { Hono } from "hono";
import { z } from "zod";
import type { WebEnv } from "../env";
import { ok, readBody, requireWorkspace } from "../http";
import { memberJson } from "../serializers";

/** People in the current workspace. Mounted at /auth/members. */
export const memberRoutes = new Hono<WebEnv>()
  .get("/", async (c) => {
    const s = requireWorkspace(c);
    return c.json({ data: (await c.get("deps").auth.members.list(s.workspace.id)).map(memberJson) });
  })

  .post("/leave", async (c) => {
    const s = requireWorkspace(c);
    await c.get("deps").auth.members.leave(s.workspace, s.user);
    return ok(c);
  })

  .patch("/:userId", async (c) => {
    const s = requireWorkspace(c);
    const b = await readBody(c, z.object({ role: z.enum(["admin", "member"]) }));
    return c.json(memberJson(await c.get("deps").auth.members.changeRole(s.workspace, s.user, c.req.param("userId"), b.role)));
  })

  .delete("/:userId", async (c) => {
    const s = requireWorkspace(c);
    await c.get("deps").auth.members.remove(s.workspace, s.user, c.req.param("userId"));
    return ok(c);
  });
