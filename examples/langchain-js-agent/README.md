# LangChain.js: triage an inbox

A [LangChain.js](https://js.langchain.com) agent with `@send0/langchain` reads your latest conversations and says which ones need a reply. It gets the read-only tools only.

| Variable            |                                                |
| ------------------- | ---------------------------------------------- |
| `SEND0_API_KEY`     | A send0 API key (https://app.send0.dev)        |
| `ANTHROPIC_API_KEY` | For the model; swap the provider to use others |

From the repo root, after `pnpm install` and `pnpm build`:

```sh
cd examples/langchain-js-agent
SEND0_API_KEY=s0_… ANTHROPIC_API_KEY=sk-ant-… pnpm start          # or: pnpm start ibx_… for a given inbox
```
