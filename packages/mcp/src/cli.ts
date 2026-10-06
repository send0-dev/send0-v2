#!/usr/bin/env node
/**
 * send0 MCP server over stdio.
 *
 *   SEND0_API_KEY=s0_live_… npx @send0/mcp
 *
 * Optional: SEND0_INBOX_ID (default inbox), SEND0_BASE_URL.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Send0 } from "@send0/sdk";
import { createSend0Server } from "./server";

const apiKey = process.env.SEND0_API_KEY;
if (!apiKey) {
  console.error("send0-mcp: set SEND0_API_KEY (create one at https://send0.dev).");
  process.exit(1);
}

const server = createSend0Server({
  client: new Send0({ apiKey, ...(process.env.SEND0_BASE_URL ? { baseUrl: process.env.SEND0_BASE_URL } : {}) }),
  defaultInboxId: process.env.SEND0_INBOX_ID,
});
await server.connect(new StdioServerTransport());
// stdout is the protocol channel; log only to stderr.
console.error("send0 MCP server running on stdio");
