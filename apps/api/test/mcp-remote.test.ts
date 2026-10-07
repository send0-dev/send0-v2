import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

let t: TestEnv;
const BASE = "https://api.test";
// The MCP client speaks HTTP; route its requests into the app in-process.
const appFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  t.app.fetch(new Request(input, init))) as typeof fetch;

async function connect(key: string | null, query = "") {
  const client = new Client({ name: "remote-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${BASE}/mcp${query}`),
    {
      fetch: appFetch,
      requestInit: key
        ? { headers: { authorization: `Bearer ${key}` } }
        : undefined,
    }
  );
  await client.connect(transport);
  return client;
}

const textOf = (r: unknown) =>
  (r as { content: { text: string }[] }).content.map((c) => c.text).join("\n");

beforeAll(async () => {
  t = await setup({
    queue: { send: async () => {} },
    mailer: { sendRaw: async () => ({ providerMessageId: "ses-1" }) },
  });
});
afterAll(() => t.close());

describe("remote MCP server (/mcp)", () => {
  it("needs a send0 API key, and says so", async () => {
    const r = await t.app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toMatch(/^Bearer realm="send0"/);
    await expect(connect(null)).rejects.toThrow();
  });

  it("answers CORS preflight for browser clients", async () => {
    const r = await t.app.request("/mcp", {
      method: "OPTIONS",
      headers: {
        origin: "https://inspector.example",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization,content-type,mcp-protocol-version",
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-headers")).toMatch(
      /authorization/
    );
  });

  it("lists the same tools as the local server and runs them as the key", async () => {
    const mcp = await connect(t.adminKey);
    const { tools } = await mcp.listTools();
    expect(tools.map((x) => x.name)).toContain("wait_for_email");
    expect(mcp.getInstructions()).toMatch(/untrusted/);

    const created = textOf(
      await mcp.callTool({
        name: "create_inbox",
        arguments: { name: "remote-agent" },
      })
    );
    expect(created).toMatch(/Created inbox remote-agent@send0\.email/);
    await deliver(
      t.db,
      "remote-agent@send0.email",
      fixture("otp-html-only.eml")
    );
    const inboxId = created.match(/id: (ibx_\w+)/)![1]!;
    const waited = textOf(
      await mcp.callTool({
        name: "wait_for_email",
        arguments: { inbox_id: inboxId, timeout: 1 },
      })
    );
    expect(waited).toMatch(/482913/);
    await mcp.close();
  });

  it("keeps an inbox-scoped key to its inbox, and honours ?inbox_id as the default", async () => {
    const list = await t.call("GET", "/v1/inboxes");
    const inbox = list.body.data.find(
      (i: { local_part: string }) => i.local_part === "remote-agent"
    );
    const other = (
      await t.call("POST", "/v1/inboxes", { body: { name: "other-remote" } })
    ).body;
    const scoped = await t.makeKey({ scopes: ["read"], inboxIds: [inbox.id] });

    const mcp = await connect(scoped, `?inbox_id=${inbox.id}`);
    const threads = textOf(
      await mcp.callTool({ name: "list_threads", arguments: {} })
    );
    expect(threads).toMatch(/482913|code/i);
    const denied = await mcp.callTool({
      name: "list_threads",
      arguments: { inbox_id: other.id },
    });
    expect((denied as { isError?: boolean }).isError).toBe(true);
    const send = await mcp.callTool({
      name: "send_email",
      arguments: { to: "dana@gmail.com", subject: "x", text: "y" },
    });
    expect(textOf(send)).toMatch(/scope|not allowed|forbidden/i);
    await mcp.close();
  });
});
