# @send0/langchain

[send0](https://send0.dev) tools for [LangChain.js](https://js.langchain.com) and LangGraph. Give an agent its own email inbox: sign up for things, read verification codes, and hold real email conversations.

```sh
npm install @send0/langchain @langchain/core zod
```

## Usage

```ts
import { send0Tools } from "@send0/langchain";
import { createAgent } from "langchain";

const agent = createAgent({
  model: "anthropic:claude-opus-5-5",
  tools: send0Tools(), // reads SEND0_API_KEY
});

const result = await agent.invoke({
  messages: [
    { role: "user", content: "Create an inbox called signup-agent and tell me its address." },
  ],
});
```

`send0Tools()` returns an array of LangChain structured tools, so it also works with `model.bindTools(...)` and LangGraph's `ToolNode`. `new Send0Toolkit(options).getTools()` returns the same tools as a toolkit.

## Tools

| Tool              | What it does                                                                 | Kind      |
| ----------------- | ---------------------------------------------------------------------------- | --------- |
| `create_inbox`    | Make a new address, e.g. `signup-agent@send0.email`                          | Creates   |
| `list_inboxes`    | Inboxes this key can use                                                     | Read-only |
| `wait_for_email`  | Block until a matching email arrives; returns the code and link it extracted | Read-only |
| `search_messages` | Full-text search, filter by sender (`*@github.com`) or direction             | Read-only |
| `get_message`     | Read one message (new text only by default, to save tokens)                  | Read-only |
| `list_threads`    | Conversations in an inbox, most recent first                                 | Read-only |
| `get_thread`      | A whole conversation, oldest first                                           | Read-only |
| `send_email`      | Start a new thread                                                           | Sends     |
| `reply`           | Answer in the same thread                                                    | Sends     |

## Options

```ts
send0Tools({
  apiKey: "s0_live_…", // default: process.env.SEND0_API_KEY
  baseUrl: "https://send0.example.com", // self-hosted send0
  client: new Send0(…), // or pass a configured @send0/sdk client
  inboxId: "ibx_…", // default inbox, so the model doesn't need inbox_id
  include: ["create_inbox", "wait_for_email"], // only these tools
  exclude: ["send_email", "reply"], // or everything but these
});
```

## Approval

`send_email` and `reply` carry `metadata.sends = true`. To have a person approve them before they run, use LangChain's human-in-the-loop middleware (it needs a checkpointer):

```ts
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";

const agent = createAgent({
  model: "anthropic:claude-opus-5-5",
  tools: send0Tools(),
  checkpointer: new MemorySaver(),
  middleware: [humanInTheLoopMiddleware({ interruptOn: { send_email: true, reply: true } })],
});
```

Or leave them out with `exclude: ["send_email", "reply"]`. An API key limited to one inbox, and an inbox with the `approval` send policy, are the safest setup for an agent.

## Untrusted content

Email is written by strangers. Tools that return mail wrap each body in `<untrusted_email>` tags with a note to treat it as data, and messages send0 flags for prompt injection carry a visible warning. Don't give an agent that reads email tools it shouldn't be talked into using.

## Errors

API errors are returned to the model as text, for example `send0 error recipient_not_allowed: …`, so it can recover instead of the run failing.

## License

MIT
