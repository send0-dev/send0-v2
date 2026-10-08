import { isDraft, type Send0 } from "@send0/sdk";
import { z } from "zod";
import { formatDraft, formatInbox, formatMessage, formatMessageLine, formatThread, formatThreadLine, UNTRUSTED_NOTE } from "./format";

export const TOOL_NAMES = [
  "create_inbox",
  "list_inboxes",
  "wait_for_email",
  "search_messages",
  "get_message",
  "list_threads",
  "get_thread",
  "send_email",
  "reply",
] as const;

export type Send0ToolName = (typeof TOOL_NAMES)[number];

/** MCP tool annotations; the other adapters read `sends` instead. */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Send0Tool<S extends z.ZodObject = z.ZodObject> {
  name: Send0ToolName;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
  /** True for tools that email someone outside (send_email, reply): the ones to put behind approval. */
  sends: boolean;
  /** Returns the text for the model. Throws on API errors; each adapter decides how to surface them. */
  execute(args: z.infer<S>): Promise<string>;
}

export interface Send0ToolsOptions {
  client: Send0;
  /** Used when a tool call has no inbox_id. */
  defaultInboxId?: string | undefined;
  /** Only these tools. */
  include?: readonly Send0ToolName[] | undefined;
  /** All tools but these. */
  exclude?: readonly Send0ToolName[] | undefined;
}

const define = <S extends z.ZodObject>(t: Send0Tool<S>): Send0Tool => t as unknown as Send0Tool;

const inboxIdArg = z.string().optional().describe("Inbox id (ibx_…). Defaults to the configured inbox.");
const recipients = z.union([z.string(), z.array(z.string()).min(1).max(50)]).describe("Email address, or a list of addresses");

/** The nine send0 tools, in the order the MCP server lists them. */
export function createSend0Tools({ client, defaultInboxId, include, exclude }: Send0ToolsOptions): Send0Tool[] {
  for (const name of [...(include ?? []), ...(exclude ?? [])]) {
    if (!(TOOL_NAMES as readonly string[]).includes(name))
      throw new Error(`Unknown send0 tool "${name}". Known: ${TOOL_NAMES.join(", ")}.`);
  }

  const inboxOf = (id?: string) => {
    const resolved = id ?? defaultInboxId;
    if (!resolved) throw new Error("No inbox given. Pass inbox_id, or call create_inbox / list_inboxes first.");
    return resolved;
  };

  const tools: Send0Tool[] = [
    define({
      name: "create_inbox",
      title: "Create inbox",
      description: "Create a new email address for this task, like name@send0.email. Omit name for a random address.",
      inputSchema: z.object({
        name: z.string().optional().describe("Local part, e.g. 'signup-agent' → signup-agent@send0.email"),
        display_name: z.string().optional().describe("Sender name shown to recipients"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      sends: false,
      execute: async ({ name, display_name }) =>
        `Created inbox ${formatInbox(await client.inboxes.create({ ...(name ? { name } : {}), ...(display_name ? { display_name } : {}) }))}`,
    }),

    define({
      name: "list_inboxes",
      title: "List inboxes",
      description: "List the inboxes this API key can use.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async () => {
        const page = await client.inboxes.list({ limit: 100 });
        return page.data.length ? page.data.map((i) => `- ${formatInbox(i)}`).join("\n") : "No inboxes yet. Use create_inbox.";
      },
    }),

    define({
      name: "wait_for_email",
      title: "Wait for email",
      description:
        "Block until an email matching the filters arrives (or one arrived in the last minute), then return it with any one-time code and verification link already extracted. Use right after triggering a sign-up, login or password reset.",
      inputSchema: z.object({
        inbox_id: inboxIdArg,
        from: z.string().optional().describe("Sender address or wildcard, e.g. '*@github.com'"),
        subject: z.string().optional().describe("Text the subject must contain"),
        timeout: z.number().int().min(1).max(600).optional().describe("Seconds to wait (default 60)"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async ({ inbox_id, from, subject, timeout }) => {
        const msg = await client.inboxes.wait(inboxOf(inbox_id), {
          ...(from ? { from } : {}),
          ...(subject ? { subject } : {}),
          timeout: timeout ?? 60,
        });
        if (!msg) return `No matching email arrived within ${timeout ?? 60} seconds.`;
        return `${UNTRUSTED_NOTE}\n\n${formatMessage(msg)}`;
      },
    }),

    define({
      name: "search_messages",
      title: "Search messages",
      description: "Search or list messages in an inbox, newest first.",
      inputSchema: z.object({
        inbox_id: inboxIdArg,
        query: z.string().optional().describe("Full-text search over subject and body"),
        from: z.string().optional().describe("Sender address or wildcard"),
        direction: z.enum(["in", "out"]).optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async ({ inbox_id, query, from, direction, limit }) => {
        const page = await client.messages.list(inboxOf(inbox_id), {
          limit: limit ?? 10,
          ...(query ? { q: query } : {}),
          ...(from ? { from } : {}),
          ...(direction ? { direction } : {}),
        });
        if (!page.data.length) return "No messages found.";
        return `${page.data.map(formatMessageLine).join("\n")}${page.hasMore ? "\n(more results exist; narrow the search or raise limit)" : ""}\nUse get_message or get_thread to read one.`;
      },
    }),

    define({
      name: "get_message",
      title: "Get message",
      description: "Read one message, including extracted codes and links. Body is the new text only unless full_text is true.",
      inputSchema: z.object({
        message_id: z.string().describe("Message id (msg_…)"),
        full_text: z.boolean().optional().describe("Include quoted history and signatures"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async ({ message_id, full_text }) =>
        `${UNTRUSTED_NOTE}\n\n${formatMessage(await client.messages.get(message_id), { full: full_text })}`,
    }),

    define({
      name: "list_threads",
      title: "List threads",
      description: "List conversations in an inbox, most recent activity first.",
      inputSchema: z.object({
        inbox_id: inboxIdArg,
        limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async ({ inbox_id, limit }) => {
        const page = await client.threads.list(inboxOf(inbox_id), {
          limit: limit ?? 10,
        });
        return page.data.length ? page.data.map(formatThreadLine).join("\n") : "No conversations yet.";
      },
    }),

    define({
      name: "get_thread",
      title: "Get thread",
      description:
        "Read a whole conversation, oldest message first. Bodies are the new text of each message, without repeated quoted history.",
      inputSchema: z.object({
        inbox_id: inboxIdArg,
        thread_id: z.string().describe("Thread id (thr_…)"),
        full_text: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      sends: false,
      execute: async ({ inbox_id, thread_id, full_text }) =>
        formatThread(await client.threads.get(inboxOf(inbox_id), thread_id), {
          full: full_text,
        }),
    }),

    define({
      name: "send_email",
      title: "Send email",
      description:
        "Send a new email from an inbox, starting a new thread. To answer someone, use reply instead so it threads correctly. Free accounts may only email people who wrote to the inbox first.",
      inputSchema: z.object({
        inbox_id: inboxIdArg,
        to: recipients,
        subject: z.string().min(1),
        text: z.string().min(1).describe("Plain-text body"),
        cc: recipients.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      sends: true,
      execute: async ({ inbox_id, to, subject, text: body, cc }) => {
        const r = await client.messages.send(inboxOf(inbox_id), {
          to,
          subject,
          text: body,
          ...(cc ? { cc } : {}),
        });
        return isDraft(r) ? formatDraft(r) : `Sent ${r.id} to ${r.to.map((t) => t.email).join(", ")} (thread ${r.thread_id}).`;
      },
    }),

    define({
      name: "reply",
      title: "Reply",
      description: "Reply to a message in the same thread (correct In-Reply-To/References and 'Re:' subject).",
      inputSchema: z.object({
        message_id: z.string().describe("The message to reply to (msg_…)"),
        text: z.string().min(1).describe("Plain-text body"),
        reply_all: z.boolean().optional().describe("Also reply to everyone on To/Cc"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      sends: true,
      execute: async ({ message_id, text: body, reply_all }) => {
        const r = await client.messages.reply(message_id, {
          text: body,
          reply_all: reply_all ?? false,
        });
        return isDraft(r) ? formatDraft(r) : `Replied with ${r.id} to ${r.to.map((t) => t.email).join(", ")} in thread ${r.thread_id}.`;
      },
    }),
  ];

  return tools.filter((t) => (!include || include.includes(t.name)) && !exclude?.includes(t.name));
}
