import { createMiddleware } from "hono/factory";
import type { WebEnv } from "../env";

/** Browsers always send Origin on cross-site POST/PATCH/DELETE. Only our own origin may change state. */
export const csrf = createMiddleware<WebEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin !== new URL(c.get("deps").appUrl).origin) {
      return c.json({ error: { code: "forbidden", message: "Cross-site request refused." } }, 403);
    }
  }
  await next();
});
