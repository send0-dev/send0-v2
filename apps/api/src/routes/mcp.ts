import { Send0 } from "@send0/sdk";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireApiKey } from "../auth";
import { markInternal } from "../rate-limit";
import type { AppEnv } from "../types";

/**
 * The remote MCP server: https://api.send0.dev/mcp, Streamable HTTP, stateless.
 *
 *   Authorization: Bearer s0_live_…        (required: the agent's own API key)
 *   ?inbox_id=ibx_… or x-send0-inbox       (optional default inbox for the tools)
 *
 * The tools call the API in-process with the same key, so the key's scopes and inbox limits
 * apply exactly as they do over HTTP.
 */
export function mcpRoutes(api: { fetch: (request: Request) => Response | Promise<Response> }) {
  return new Hono<AppEnv>()
    .use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["authorization", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id", "x-send0-inbox"],
        exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
        maxAge: 86400,
      }),
    )
    .use("*", async (c, next) => {
      // MCP clients look for this to know a key is needed.
      c.header("WWW-Authenticate", 'Bearer realm="send0", error_description="Use a send0 API key as the Bearer token"');
      await next();
    })
    .use("*", requireApiKey)
    .all("/", async (c) => {
      const key = c.req
        .header("authorization")!
        .replace(/^Bearer\s+/i, "")
        .trim();
      const client = new Send0({
        apiKey: key,
        baseUrl: "https://api.internal",
        maxRetries: 0,
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          Promise.resolve(api.fetch(markInternal(new Request(input, init))))) as typeof fetch,
      });
      const defaultInboxId = c.req.query("inbox_id") ?? c.req.header("x-send0-inbox") ?? undefined;
      // Loaded on first use, so the MCP SDK doesn't add to every API request's cold start.
      const { handleMcpHttp } = await import("@send0/mcp");
      return handleMcpHttp(c.req.raw, { client, defaultInboxId });
    });
}
