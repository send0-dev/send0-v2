import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSend0Server, type ServerOptions } from "./server";

/**
 * Serves one MCP request over Streamable HTTP, statelessly: a fresh server per request, JSON
 * responses, no session. Works anywhere with web-standard Request/Response (Workers, Deno, Bun,
 * Node 18+). The caller authenticates the request and passes a client acting as that caller.
 */
export async function handleMcpHttp(request: Request, options: ServerOptions): Promise<Response> {
  const server = createSend0Server(options);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
