import { Send0Error, type Send0 } from "@send0/sdk";
import { describe, expect, it, vi } from "vitest";
import { createSend0Tools, TOOL_NAMES, toolErrorText, type Send0Tool } from "../src";

const inbox = { id: "ibx_1", address: "agent@send0.email", send_policy: "reply_only", display_name: null };
const thread = { id: "thr_1", subject: "Hi", message_count: 1, participants: [], last_message_at: "2026-10-06T10:00:00.000Z" };
const page = <T>(data: T[]) => ({ data, hasMore: false });

function fakeClient() {
  const client = {
    inboxes: {
      create: vi.fn(async () => inbox),
      list: vi.fn(async () => page([inbox])),
      wait: vi.fn(async (): Promise<unknown> => null),
    },
    messages: {
      list: vi.fn(async () => page([])),
      get: vi.fn(async () => {
        throw new Send0Error("Message not found", 404, "not_found");
      }),
      send: vi.fn(),
      reply: vi.fn(),
    },
    threads: { list: vi.fn(async () => page([thread])), get: vi.fn() },
  };
  return { client, sdk: client as unknown as Send0 };
}

const byName = (tools: Send0Tool[], name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no ${name}`);
  return t;
};

describe("createSend0Tools", () => {
  it("returns all nine tools in MCP order, with only send_email and reply marked as sending", () => {
    const tools = createSend0Tools({ client: fakeClient().sdk });
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(tools.filter((t) => t.sends).map((t) => t.name)).toEqual(["send_email", "reply"]);
    for (const t of tools) expect(t.annotations.readOnlyHint === true).toBe(!t.sends && t.name !== "create_inbox");
  });

  it.each([
    [{ include: ["wait_for_email", "create_inbox"] as const }, ["create_inbox", "wait_for_email"]],
    [{ exclude: ["send_email", "reply"] as const }, TOOL_NAMES.filter((n) => n !== "send_email" && n !== "reply")],
    [{ include: ["reply", "get_message"] as const, exclude: ["reply"] as const }, ["get_message"]],
  ])("filters with %j", (opts, names) => {
    expect(createSend0Tools({ client: fakeClient().sdk, ...opts }).map((t) => t.name)).toEqual(names);
  });

  it("rejects unknown tool names", () => {
    expect(() => createSend0Tools({ client: fakeClient().sdk, include: ["send_mail" as "send_email"] })).toThrow(
      /Unknown send0 tool "send_mail"/,
    );
  });

  it("uses the default inbox when the call has none, and the call's inbox over it", async () => {
    const { client, sdk } = fakeClient();
    const tools = createSend0Tools({ client: sdk, defaultInboxId: "ibx_default" });
    await byName(tools, "list_threads").execute({});
    await byName(tools, "list_threads").execute({ inbox_id: "ibx_other", limit: 5 });
    expect(client.threads.list.mock.calls).toEqual([
      ["ibx_default", { limit: 10 }],
      ["ibx_other", { limit: 5 }],
    ]);
  });

  it("asks for an inbox when there is no default", async () => {
    const tools = createSend0Tools({ client: fakeClient().sdk });
    await expect(byName(tools, "wait_for_email").execute({})).rejects.toThrow("No inbox given. Pass inbox_id");
  });

  it("returns formatted text", async () => {
    const { client, sdk } = fakeClient();
    const tools = createSend0Tools({ client: sdk, defaultInboxId: "ibx_1" });
    expect(await byName(tools, "create_inbox").execute({ name: "agent" })).toBe(
      "Created inbox agent@send0.email (id: ibx_1, send policy: reply_only)",
    );
    expect(client.inboxes.create).toHaveBeenCalledWith({ name: "agent" });
    expect(await byName(tools, "wait_for_email").execute({ timeout: 5 })).toBe("No matching email arrived within 5 seconds.");
    expect(await byName(tools, "search_messages").execute({})).toBe("No messages found.");
  });

  it("lets API errors through for the adapter to map", async () => {
    const tools = createSend0Tools({ client: fakeClient().sdk });
    const err = await byName(tools, "get_message")
      .execute({ message_id: "msg_x" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Send0Error);
    expect(toolErrorText(err)).toBe("send0 error not_found: Message not found");
    expect(toolErrorText(new Error("boom"))).toBe("Error: boom");
  });
});
