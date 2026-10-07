# @send0/mcp

[MCP](https://modelcontextprotocol.io) server for [send0](https://send0.dev). Give Claude, Cursor or any MCP client its own email inbox: sign up for things, read verification codes, and hold real email conversations.

## Tools

| Tool                          | What it does                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `create_inbox`                | Make a new address, e.g. `signup-agent@send0.email`                                               |
| `list_inboxes`                | Inboxes this key can use                                                                          |
| `wait_for_email`              | Block until a matching email arrives; returns the one-time code and verify link already extracted |
| `search_messages`             | Full-text search, filter by sender (`*@github.com`) or direction                                  |
| `get_message`                 | Read one message (new text only by default, to save tokens)                                       |
| `list_threads` / `get_thread` | Read whole conversations, oldest first                                                            |
| `send_email`                  | Start a new thread                                                                                |
| `reply`                       | Answer in the same thread                                                                         |

Email bodies are returned inside `<untrusted_email>` tags with a note to treat them as data, and messages flagged for prompt injection carry a visible warning. Read-only tools are annotated `readOnlyHint`, and sending tools `openWorldHint`, so clients can ask before sending.

## Setup

Get an API key at https://send0.dev. A key limited to one inbox is the safest choice for an agent.

### Claude Code

```sh
claude mcp add send0 --env SEND0_API_KEY=s0_live_… -- npx -y @send0/mcp
```

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "send0": {
      "command": "npx",
      "args": ["-y", "@send0/mcp"],
      "env": { "SEND0_API_KEY": "s0_live_…" }
    }
  }
}
```

### Options

| Variable         |                                               |
| ---------------- | --------------------------------------------- |
| `SEND0_API_KEY`  | Required                                      |
| `SEND0_INBOX_ID` | Default inbox, so tools don't need `inbox_id` |
| `SEND0_BASE_URL` | For self-hosted send0                         |

## Use it from code

```ts
import { createSend0Server } from "@send0/mcp";
import { Send0 } from "@send0/sdk";

const server = createSend0Server({ client: new Send0(process.env.SEND0_API_KEY) });
// connect any MCP transport
```

## License

MIT
