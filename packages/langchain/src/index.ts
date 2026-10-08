import { createSend0Tools, toolErrorText, type Send0ToolName } from "@send0/agent-tools";
import { Send0 } from "@send0/sdk";
import { BaseToolkit, tool, type StructuredTool } from "@langchain/core/tools";

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
}

/**
 * The send0 tools as LangChain structured tools, for `createAgent`, `bindTools` or LangGraph.
 *
 * API errors come back to the model as text (`send0 error <code>: <message>`) so it can recover.
 */
export function send0Tools(options: Send0ToolsOptions = {}): StructuredTool[] {
  const client =
    options.client ??
    new Send0({
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });
  return createSend0Tools({ client, defaultInboxId: options.inboxId, include: options.include, exclude: options.exclude }).map((t) =>
    tool(
      async (args: Record<string, unknown>): Promise<string> => {
        try {
          return await t.execute(args);
        } catch (err) {
          return toolErrorText(err);
        }
      },
      // `sends` marks send_email and reply, for human-in-the-loop setups that filter on metadata.
      { name: t.name, description: t.description, schema: t.inputSchema, metadata: { sends: t.sends } },
    ),
  );
}

/** The send0 tools as a LangChain toolkit: `new Send0Toolkit().getTools()`. */
export class Send0Toolkit extends BaseToolkit {
  tools: StructuredTool[];

  constructor(options: Send0ToolsOptions = {}) {
    super();
    this.tools = send0Tools(options);
  }
}
