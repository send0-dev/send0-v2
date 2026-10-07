import { HOSTED_LIMITS } from "@send0/config";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireApiKey } from "./auth";
import { ApiError, errorBody } from "./errors";
import { idempotency } from "./idempotency";
import { buildOpenApi } from "./openapi/spec";
import { apiKeyRoutes } from "./routes/api-keys";
import { eventRoutes } from "./routes/events";
import { fileRoutes } from "./routes/files";
import { sesWebhookRoutes } from "./routes/ses-webhook";
import { webhookRoutes } from "./routes/webhooks";
import { inboxRoutes } from "./routes/inboxes";
import { inboxMessageRoutes, messageRoutes } from "./routes/messages";
import { mcpRoutes } from "./routes/mcp";
import { statsRoutes } from "./routes/stats";
import { usageRoutes } from "./routes/usage";
import { draftRoutes, inboxDraftRoutes, inboxSendRoutes, messageSendRoutes } from "./routes/send";
import { threadRoutes } from "./routes/threads";
import type { AppDeps, AppEnv, ResolvedDeps } from "./types";

export function createApp(deps: AppDeps) {
  if (deps.mailDomains.length === 0) throw new Error("createApp needs at least one mail domain");
  const app = new Hono<AppEnv>();
  const resolved: ResolvedDeps = {
    ...deps,
    mailDomains: deps.mailDomains.map((d) => d.toLowerCase()),
    limits: deps.limits ?? HOSTED_LIMITS,
  };

  app.use(async (c, next) => {
    c.set("deps", resolved);
    c.set("requestId", c.req.header("cf-ray") ?? crypto.randomUUID());
    await next();
    c.header("x-request-id", c.get("requestId"));
  });

  app.get("/", (c) => c.json({ name: "send0 API", docs: "https://send0.dev", version: "v1" }));
  app.get("/health", (c) => c.json({ ok: true }));
  let spec: ReturnType<typeof buildOpenApi> | undefined;
  app.get("/openapi.json", (c) => {
    spec ??= buildOpenApi();
    c.header("cache-control", "public, max-age=300");
    c.header("access-control-allow-origin", "*");
    return c.json(spec);
  });

  // SES delivery events from SNS (token-protected, no API key).
  app.route("/internal/ses-events", sesWebhookRoutes);

  // App-signed download links: the token is the credential, so this sits before v1's API-key auth.
  app.route("/v1/files", fileRoutes);

  const v1 = new Hono<AppEnv>();
  v1.use(requireApiKey, idempotency);
  v1.route("/api-keys", apiKeyRoutes);
  v1.route("/inboxes/:inboxId/threads", threadRoutes);
  v1.route("/inboxes/:inboxId/messages", inboxMessageRoutes);
  v1.route("/inboxes/:inboxId/messages", inboxSendRoutes);
  v1.route("/inboxes/:inboxId/drafts", inboxDraftRoutes);
  v1.route("/inboxes", inboxRoutes);
  v1.route("/messages", messageRoutes);
  v1.route("/messages", messageSendRoutes);
  v1.route("/drafts", draftRoutes);
  v1.route("/webhooks", webhookRoutes);
  v1.route("/events", eventRoutes);
  v1.route("/usage", usageRoutes);
  v1.route("/stats", statsRoutes);
  app.route("/v1", v1);
  app.route("/mcp", mcpRoutes(app));

  app.notFound((c) => c.json(errorBody(c, new ApiError(404, "route_not_found", `No route ${c.req.method} ${c.req.path}.`)), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(c, err), err.status);
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(errorBody(c, new ApiError(err.status as 400, "invalid_request", err.message || "Invalid request.")), err.status);
    }
    console.error(
      JSON.stringify({
        event: "api.error",
        request_id: c.get("requestId"),
        error: String(err),
        stack: (err as Error).stack,
      }),
    );
    return c.json(errorBody(c, new ApiError(500, "internal_error", "Something went wrong on our side. It has been logged.")), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
