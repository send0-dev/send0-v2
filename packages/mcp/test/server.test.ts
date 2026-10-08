import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Send0Error, type Send0 } from "@send0/sdk";
import { describe, expect, it } from "vitest";
import { createSend0Server } from "../src/server";

async function connect(client: unknown, defaultInboxId?: string) {
  const server = createSend0Server({ client: client as Send0, ...(defaultInboxId ? { defaultInboxId } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "test", version: "0" });
  await mcp.connect(b);
  return mcp;
}

describe("createSend0Server", () => {
  it("lists the nine tools, with sending tools marked open-world", async () => {
    const mcp = await connect({});
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "create_inbox",
      "list_inboxes",
      "wait_for_email",
      "search_messages",
      "get_message",
      "list_threads",
      "get_thread",
      "send_email",
      "reply",
    ]);
    expect(tools.filter((t) => t.annotations?.openWorldHint).map((t) => t.name)).toEqual(["send_email", "reply"]);
    expect(tools.find((t) => t.name === "wait_for_email")?.inputSchema.properties).toHaveProperty("from");
  });

  it("returns API errors as readable tool errors", async () => {
    const mcp = await connect({
      messages: {
        get: () => Promise.reject(new Send0Error("Message not found", 404, "not_found")),
      },
    });
    expect(await mcp.callTool({ name: "get_message", arguments: { message_id: "msg_x" } })).toEqual({
      content: [{ type: "text", text: "send0 error not_found: Message not found" }],
      isError: true,
    });
  });
});
