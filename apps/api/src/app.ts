import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireApiKey } from "./auth";
import { ApiError, errorBody } from "./errors";
import { idempotency } from "./idempotency";
import { apiKeyRoutes } from "./routes/api-keys";
import { eventRoutes } from "./routes/events";
import { webhookRoutes } from "./routes/webhooks";
import { inboxRoutes } from "./routes/inboxes";
import { inboxMessageRoutes, messageRoutes } from "./routes/messages";
import { threadRoutes } from "./routes/threads";
import type { AppDeps, AppEnv } from "./types";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(async (c, next) => {
    c.set("deps", deps);
    c.set("requestId", c.req.header("cf-ray") ?? crypto.randomUUID());
    await next();
    c.header("x-request-id", c.get("requestId"));
  });

  app.get("/", (c) => c.json({ name: "send0 API", docs: "https://send0.dev", version: "v1" }));
  app.get("/health", (c) => c.json({ ok: true }));

  const v1 = new Hono<AppEnv>();
  v1.use(requireApiKey, idempotency);
  v1.route("/api-keys", apiKeyRoutes);
  v1.route("/inboxes/:inboxId/threads", threadRoutes);
  v1.route("/inboxes/:inboxId/messages", inboxMessageRoutes);
  v1.route("/inboxes", inboxRoutes);
  v1.route("/messages", messageRoutes);
  v1.route("/webhooks", webhookRoutes);
  v1.route("/events", eventRoutes);
  app.route("/v1", v1);

  app.notFound((c) => c.json(errorBody(c, new ApiError(404, "route_not_found", `No route ${c.req.method} ${c.req.path}.`)), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(c, err), err.status);
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(errorBody(c, new ApiError(err.status as 400, "invalid_request", err.message || "Invalid request.")), err.status);
    }
    console.error(JSON.stringify({ event: "api.error", request_id: c.get("requestId"), error: String(err), stack: (err as Error).stack }));
    return c.json(errorBody(c, new ApiError(500, "internal_error", "Something went wrong on our side. It has been logged.")), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
