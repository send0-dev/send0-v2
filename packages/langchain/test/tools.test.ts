import { ToolMessage } from "@langchain/core/messages";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Send0Error, type Send0 } from "@send0/sdk";
import { describe, expect, it, vi } from "vitest";
import { Send0Toolkit, send0Tools } from "../src";

const NAMES = [
  "create_inbox",
  "list_inboxes",
  "wait_for_email",
  "search_messages",
  "get_message",
  "list_threads",
  "get_thread",
  "send_email",
  "reply",
];
const inbox = { id: "ibx_1", address: "agent@send0.email", send_policy: "reply_only", display_name: null };

function fakeClient() {
  const client = {
    inboxes: { create: vi.fn(async () => inbox), list: vi.fn(), wait: vi.fn() },
    messages: {
      list: vi.fn(),
      get: vi.fn(async () => {
        throw new Send0Error("Message not found", 404, "not_found");
      }),
      send: vi.fn(),
      reply: vi.fn(async () => ({ object: "message", id: "msg_3", thread_id: "thr_1", to: [{ name: null, email: "ann@example.com" }] })),
    },
    threads: { list: vi.fn(), get: vi.fn() },
  };
  return { client, sdk: client as unknown as Send0 };
}

const byName = (name: string, tools = send0Tools({ client: fakeClient().sdk })) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no ${name}`);
  return t;
};

describe("send0Tools", () => {
  it("returns the nine tools with their MCP names, descriptions and schemas", () => {
    const tools = send0Tools({ client: fakeClient().sdk });
    expect(tools.map((t) => t.name)).toEqual(NAMES);
    expect(byName("reply", tools).description).toBe(
      "Reply to a message in the same thread (correct In-Reply-To/References and 'Re:' subject).",
    );
    expect(toJsonSchema(byName("reply", tools).schema)).toMatchObject({
      type: "object",
      required: ["message_id", "text"],
      properties: { message_id: { type: "string" }, reply_all: { type: "boolean" } },
    });
    expect(tools.filter((t) => t.metadata?.sends).map((t) => t.name)).toEqual(["send_email", "reply"]);
  });

  it("honours include and exclude", () => {
    expect(send0Tools({ client: fakeClient().sdk, include: ["wait_for_email"] }).map((t) => t.name)).toEqual(["wait_for_email"]);
    expect(send0Tools({ client: fakeClient().sdk, exclude: ["send_email", "reply"] }).map((t) => t.name)).toEqual(NAMES.slice(0, 7));
  });

  it("calls the client and returns the formatted text", async () => {
    const { client, sdk } = fakeClient();
    const tools = send0Tools({ client: sdk });
    expect(await byName("create_inbox", tools).invoke({ name: "agent" })).toBe(
      "Created inbox agent@send0.email (id: ibx_1, send policy: reply_only)",
    );
    expect(await byName("reply", tools).invoke({ message_id: "msg_1", text: "Thanks" })).toBe(
      "Replied with msg_3 to ann@example.com in thread thr_1.",
    );
    expect(client.messages.reply).toHaveBeenCalledWith("msg_1", { text: "Thanks", reply_all: false });
  });

  it("answers a model's tool call with a ToolMessage", async () => {
    const out: unknown = await byName("create_inbox").invoke({ type: "tool_call", id: "call_1", name: "create_inbox", args: {} });
    expect(out).toBeInstanceOf(ToolMessage);
    expect((out as ToolMessage).tool_call_id).toBe("call_1");
    expect((out as ToolMessage).content).toMatch(/^Created inbox agent@send0.email/);
  });

  it("returns errors as text the model can act on", async () => {
    expect(await byName("get_message").invoke({ message_id: "msg_x" })).toBe("send0 error not_found: Message not found");
    expect(await byName("list_threads").invoke({})).toBe(
      "Error: No inbox given. Pass inbox_id, or call create_inbox / list_inboxes first.",
    );
  });

  it("rejects input that doesn't match the schema", async () => {
    await expect(byName("reply").invoke({ message_id: "msg_1" })).rejects.toThrow();
  });
});

describe("Send0Toolkit", () => {
  it("exposes the same tools", () => {
    expect(new Send0Toolkit({ client: fakeClient().sdk, inboxId: "ibx_1" }).getTools().map((t) => t.name)).toEqual(NAMES);
  });
});
