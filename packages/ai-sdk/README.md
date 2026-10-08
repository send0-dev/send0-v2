# @send0/ai-sdk

[send0](https://send0.dev) tools for the [Vercel AI SDK](https://ai-sdk.dev). Give an agent its own email inbox: sign up for things, read verification codes, and hold real email conversations.

```sh
npm install @send0/ai-sdk ai zod
```

## Usage

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { send0Tools } from "@send0/ai-sdk";
import { generateText, stepCountIs } from "ai";

const { text } = await generateText({
  model: anthropic("claude-opus-5-5"),
  tools: send0Tools(), // reads SEND0_API_KEY
  stopWhen: stepCountIs(10),
  prompt:
    "Create an inbox called signup-agent, then wait for the verification email and tell me the code.",
});
```

`send0Tools()` returns a record of AI SDK tools, so it works with `generateText`, `streamText` and `Agent`, and you can spread it next to your own tools.

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
  requireApproval: true, // ask before send_email and reply run
});
```

## Approval

With `requireApproval: true`, `send_email` and `reply` don't run until you approve them: the AI SDK returns a `tool-approval-request` instead of executing, and you answer with a `tool-approval-response` (in `useChat`, `addToolApprovalResponse`). You can also set approval per call with the AI SDK's `toolApproval` option:

```ts
import { send0ToolApproval, send0Tools } from "@send0/ai-sdk";

await generateText({ model, tools: send0Tools(), toolApproval: send0ToolApproval, prompt });
```

An API key limited to one inbox, and an inbox with the `approval` send policy, are the safest setup for an agent.

## Untrusted content

Email is written by strangers. Tools that return mail wrap each body in `<untrusted_email>` tags with a note to treat it as data, and messages send0 flags for prompt injection carry a visible warning. Don't give an agent that reads email tools it shouldn't be talked into using.

## Errors

API errors are returned to the model as text, for example `send0 error recipient_not_allowed: …`, so it can recover instead of the call failing.

## License

MIT
