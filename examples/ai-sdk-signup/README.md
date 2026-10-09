# AI SDK: sign up and read the code

An agent built with the [Vercel AI SDK](https://ai-sdk.dev) and `@send0/ai-sdk` creates an inbox, waits for a verification email and reports the one-time code.

| Variable            |                                                |
| ------------------- | ---------------------------------------------- |
| `SEND0_API_KEY`     | A send0 API key (https://app.send0.dev)        |
| `ANTHROPIC_API_KEY` | For the model; swap the provider to use others |

From the repo root, after `pnpm install` and `pnpm build`:

```sh
cd examples/ai-sdk-signup
SEND0_API_KEY=s0_… ANTHROPIC_API_KEY=sk-ant-… pnpm start
```

When the inbox address is printed, sign up for something with it, or send it an email with a code.

To use it in your own project: `npm install @send0/ai-sdk ai zod`.
