import { type Send0, Send0Error } from "@send0/sdk";
import { asSchema, generateText, stepCountIs } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { send0ToolApproval, send0Tools } from "../src";

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
const opts = { toolCallId: "call_1", messages: [], context: undefined } as never;

function fakeClient() {
  const client = {
    inboxes: { create: vi.fn(async () => inbox), list: vi.fn(), wait: vi.fn() },
    messages: {
      list: vi.fn(),
      get: vi.fn(async () => {
        throw new Send0Error("Message not found", 404, "not_found");
      }),
      send: vi.fn(async () => ({ object: "message", id: "msg_2", thread_id: "thr_2", to: [{ name: null, email: "bob@example.com" }] })),
      reply: vi.fn(),
    },
    threads: { list: vi.fn(), get: vi.fn() },
  };
  return { client, sdk: client as unknown as Send0 };
}

const run = (tools: ReturnType<typeof send0Tools>, name: string, input: object) => {
  const execute = tools[name]?.execute;
  if (!execute) throw new Error(`no ${name}`);
  return execute(input, opts);
};

describe("send0Tools", () => {
  it("keys the nine tools by their MCP names, with JSON schemas for the model", async () => {
    const tools = send0Tools({ client: fakeClient().sdk });
    expect(Object.keys(tools)).toEqual(NAMES);
    const schema = await asSchema(tools.send_email!.inputSchema).jsonSchema;
    expect(schema).toMatchObject({ type: "object", required: ["to", "subject", "text"] });
    expect(Object.keys((schema as { properties: object }).properties)).toEqual(["inbox_id", "to", "subject", "text", "cc"]);
    expect(tools.wait_for_email!.description).toMatch(/^Block until an email matching the filters arrives/);
  });

  it("honours include and exclude", () => {
    expect(Object.keys(send0Tools({ client: fakeClient().sdk, include: ["create_inbox", "wait_for_email"] }))).toEqual([
      "create_inbox",
      "wait_for_email",
    ]);
    expect(Object.keys(send0Tools({ client: fakeClient().sdk, exclude: ["send_email", "reply"] }))).toEqual(NAMES.slice(0, 7));
  });

  it("calls the client and returns the formatted text", async () => {
    const { client, sdk } = fakeClient();
    const tools = send0Tools({ client: sdk, inboxId: "ibx_1" });
    expect(await run(tools, "create_inbox", { name: "agent" })).toBe(
      "Created inbox agent@send0.email (id: ibx_1, send policy: reply_only)",
    );
    expect(await run(tools, "send_email", { to: "bob@example.com", subject: "Hi", text: "Hello" })).toBe(
      "Sent msg_2 to bob@example.com (thread thr_2).",
    );
    expect(client.messages.send).toHaveBeenCalledWith("ibx_1", { to: "bob@example.com", subject: "Hi", text: "Hello" });
  });

  it("returns errors as text the model can act on", async () => {
    const tools = send0Tools({ client: fakeClient().sdk });
    expect(await run(tools, "get_message", { message_id: "msg_x" })).toBe("send0 error not_found: Message not found");
    expect(await run(tools, "list_threads", {})).toBe("Error: No inbox given. Pass inbox_id, or call create_inbox / list_inboxes first.");
  });

  it("puts only the sending tools behind approval", () => {
    const tools = send0Tools({ client: fakeClient().sdk, requireApproval: true });
    expect(Object.keys(tools).filter((n) => tools[n]!.needsApproval)).toEqual(["send_email", "reply"]);
    expect(Object.values(send0Tools({ client: fakeClient().sdk })).some((t) => t.needsApproval)).toBe(false);
    expect(send0ToolApproval).toEqual({ send_email: "user-approval", reply: "user-approval" });
  });

  it("reads the API key from SEND0_API_KEY", () => {
    vi.stubEnv("SEND0_API_KEY", "");
    expect(() => send0Tools()).toThrow(/Missing API key/);
    vi.stubEnv("SEND0_API_KEY", "s0_test_x");
    expect(Object.keys(send0Tools())).toHaveLength(9);
    vi.unstubAllEnvs();
  });
});

describe("with generateText", () => {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  const callSendEmail = {
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "call_1",
        toolName: "send_email",
        input: JSON.stringify({ inbox_id: "ibx_1", to: "bob@example.com", subject: "Hi", text: "Hello" }),
      },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
  const done = {
    content: [{ type: "text" as const, text: "Done." }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage,
    warnings: [],
  };

  it("runs a tool call end to end", async () => {
    const { client, sdk } = fakeClient();
    const result = await generateText({
      model: new MockLanguageModelV4({ doGenerate: [callSendEmail, done] }),
      tools: send0Tools({ client: sdk }),
      stopWhen: stepCountIs(3),
      prompt: "Email Bob",
    });
    expect(client.messages.send).toHaveBeenCalledOnce();
    expect(result.steps[0]?.toolResults[0]?.output).toBe("Sent msg_2 to bob@example.com (thread thr_2).");
    expect(result.text).toBe("Done.");
  });

  it("stops for approval before sending when requireApproval is set", async () => {
    const { client, sdk } = fakeClient();
    const result = await generateText({
      model: new MockLanguageModelV4({ doGenerate: [callSendEmail, done] }),
      tools: send0Tools({ client: sdk, requireApproval: true }),
      stopWhen: stepCountIs(3),
      prompt: "Email Bob",
    });
    expect(client.messages.send).not.toHaveBeenCalled();
    expect(result.content.some((p) => p.type === "tool-approval-request")).toBe(true);
  });
});
