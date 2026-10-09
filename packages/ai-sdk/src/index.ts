import { createSend0Tools, toolErrorText, type Send0ToolName } from "@send0/agent-tools";
import { Send0 } from "@send0/sdk";
import { tool, type Tool } from "ai";

export type { Send0ToolName };

export interface Send0ToolsOptions {
  /** Defaults to process.env.SEND0_API_KEY. Ignored when `client` is given. */
  apiKey?: string;
  /** For self-hosted send0. Ignored when `client` is given. */
  baseUrl?: string;
  /** A configured client, instead of apiKey and baseUrl. */
  client?: Send0;
  /** Default inbox, so the model doesn't need to pass inbox_id. */
  inboxId?: string;
  /** Only these tools. */
  include?: readonly Send0ToolName[];
  /** All tools but these. */
  exclude?: readonly Send0ToolName[];
  /** Ask for approval before send_email and reply run (the AI SDK's tool approval flow). */
  requireApproval?: boolean;
}

/**
 * The send0 tools for `generateText`, `streamText` or an `Agent`, keyed by tool name.
 *
 *   const { text } = await generateText({ model, tools: send0Tools(), stopWhen: stepCountIs(10), prompt });
 *
 * API errors come back to the model as text (`send0 error <code>: <message>`) so it can recover.
 */
export function send0Tools(options: Send0ToolsOptions = {}): Record<string, Tool> {
  const client =
    options.client ??
    new Send0({
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });
  const tools: Record<string, Tool> = {};
  for (const t of createSend0Tools({ client, defaultInboxId: options.inboxId, include: options.include, exclude: options.exclude })) {
    tools[t.name] = tool({
      description: t.description,
      inputSchema: t.inputSchema,
      // Tool-level approval still works in ai@7; `send0ToolApproval` is the call-level equivalent.
      ...(options.requireApproval && t.sends ? { needsApproval: true } : {}),
      execute: async (args: Record<string, unknown>): Promise<string> => {
        try {
          return await t.execute(args);
        } catch (err) {
          return toolErrorText(err);
        }
      },
    });
  }
  return tools;
}

/**
 * Approval for the tools that email people, for the `toolApproval` option of `generateText`,
 * `streamText` and `Agent`: `generateText({ tools: send0Tools(), toolApproval: send0ToolApproval, … })`.
 */
export const send0ToolApproval = { send_email: "user-approval", reply: "user-approval" } as const;
