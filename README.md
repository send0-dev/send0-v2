<p align="center">
  <img src="apps/www/public/favicon.svg" width="56" height="56" alt="" />
</p>

<h1 align="center">send0</h1>

<p align="center">
  <strong>Give any agent an email address in one API call.</strong><br />
  Open-source email inboxes for AI agents. Send, receive, thread and wait, with webhooks on every plan.
</p>

<p align="center">
  <a href="https://send0.dev/docs">Docs</a> ·
  <a href="https://send0.dev/docs/quickstart/typescript">Quickstart</a> ·
  <a href="https://api.send0.dev/openapi.json">OpenAPI</a> ·
  <a href="https://app.send0.dev">Dashboard</a>
</p>

<p align="center">
  <a href="https://github.com/send0-dev/send0-v2/actions/workflows/ci.yml"><img src="https://github.com/send0-dev/send0-v2/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/server-AGPL--3.0-blue" alt="Server license: AGPL-3.0" /></a>
  <a href="packages/sdk/LICENSE"><img src="https://img.shields.io/badge/SDKs%20%26%20MCP-MIT-green" alt="SDK and MCP license: MIT" /></a>
</p>

---

Most email APIs are built to send receipts. send0 starts from the **inbox**: each agent gets a real address that receives, sends and holds threaded conversations, and every message arrives parsed, with the parts an agent needs already pulled out.

```ts
import { Send0 } from "@send0/sdk";

const send0 = new Send0(process.env.SEND0_API_KEY);

const inbox = await send0.inboxes.create({ name: "signup-agent" });
// → signup-agent@send0.email

await browser.fill("#email", inbox.address);
await browser.click("Create account");

// Blocks until the email lands, then returns it with the code already extracted.
const msg = await send0.inboxes.wait(inbox.id, { from: "*@github.com", timeout: 60 });
msg?.extracted?.otp; // "482913"

await send0.messages.reply(msg.id, { text: "Thanks, confirmed." }); // threads in Gmail and Outlook
```

## Features

- **An address in one call.** `name@send0.email` is ready in milliseconds (custom domains are coming). Plus-addressing (`bot+task42@`) tags mail without more inboxes.
- **Wait, don't poll.** One long-poll call blocks until the email you need arrives and returns the one-time code and verification link.
- **Clean, structured messages.** The new reply text without quoted history, SPF/DKIM/DMARC verdicts, and a prompt-injection flag on every inbound message.
- **Real threads.** Outbound mail carries `Message-ID`, `In-Reply-To` and `References`, so conversations stay threaded for your agent and for the person on the other side.
- **Webhooks and live events on every plan.** Signed webhooks (`send0-signature`, Stripe-style HMAC) with automatic retries and manual redelivery, plus a Server-Sent Events stream.
- **Built for agents, safe by default.** Inbox-scoped API keys, human approval for outgoing mail, reply-only sending on the free tier, automatic suppression of bounces and complaints, and sending that pauses itself when complaint or bounce rates spike.
- **MCP server.** Plug inboxes into Claude, Cursor, VS Code or any MCP client, locally or at `https://api.send0.dev/mcp`.
- **A dashboard for the humans.** Read threads, approve drafts, manage keys, webhooks and teammates at [app.send0.dev](https://app.send0.dev).

## Use it

|            |                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| REST API   | `https://api.send0.dev`, Bearer API key, [OpenAPI 3.1 spec](https://api.send0.dev/openapi.json)                                              |
| TypeScript | `npm install @send0/sdk`, see [packages/sdk](packages/sdk)                                                                                   |
| Python     | `pip install send0`, see [packages/sdk-python](packages/sdk-python)                                                                          |
| MCP        | `claude mcp add --transport http send0 https://api.send0.dev/mcp --header "Authorization: Bearer s0_live_…"`, or `npx -y @send0/mcp` locally |

<details>
<summary>The same flow with cURL</summary>

```bash
curl https://api.send0.dev/v1/inboxes \
  -H "Authorization: Bearer $SEND0_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "name": "research-agent" }'

curl "https://api.send0.dev/v1/inboxes/ibx_…/messages/wait?from=*@acme.dev&timeout=60" \
  -H "Authorization: Bearer $SEND0_API_KEY"

curl https://api.send0.dev/v1/messages/msg_…/reply \
  -H "Authorization: Bearer $SEND0_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "text": "Thanks, confirmed." }'
```

</details>

Full guides and the API reference are at **[send0.dev/docs](https://send0.dev/docs)**.

## How it works

```text
Inbound   sender ─▶ MX (send0.email) ─▶ accept/refuse during SMTP ─▶ store raw .eml
          ─▶ parse, extract code + links, check SPF/DKIM/DMARC, flag injection
          ─▶ thread ─▶ webhook + live stream + any waiting wait() call

Outbound  your agent ─▶ policy checks (reply-only, suppression, daily cap)
          ─▶ MIME with threading headers, DKIM-signed ─▶ Amazon SES
          ─▶ delivered / bounced / complained events ─▶ webhooks
```

The hosted service runs on Cloudflare Workers (API, inbound mail, Durable Objects for real-time, Queues), Postgres (Neon) and Amazon SES. Everything is TypeScript; the HTTP layer is [Hono](https://hono.dev), so the same app can run on Node.

## Repository

```
apps/api            REST API, webhooks, real-time, remote MCP       (api.send0.dev)
apps/inbound        Inbound mail Worker: SMTP accept/refuse → store → ingest
apps/web            Dashboard SPA and its Worker                    (app.send0.dev)
apps/docs           Documentation                                   (send0.dev/docs)
apps/www            Marketing site                                  (send0.dev)
packages/core       Parsing, threading, extraction, safety: pure TypeScript
packages/db         Postgres schema and migrations (Drizzle)
packages/pipeline   Inbound ingest and event fan-out
packages/adapters   Blob storage and mail transport behind interfaces
packages/auth       Dashboard accounts, sessions, workspaces, roles
packages/sdk        @send0/sdk, the TypeScript SDK (MIT)
packages/sdk-python send0, the Python SDK (MIT)
packages/mcp        @send0/mcp, the MCP server (MIT)
fixtures/emails     Real-world .eml corpus used by the tests
```

## Development

Requires Node 22, pnpm 9, and [uv](https://docs.astral.sh/uv/) for the Python SDK.

```bash
pnpm install
pnpm verify                            # format check, lint, typecheck, tests
pnpm --filter @send0/web dev:local     # the whole product locally at http://localhost:5199
```

No accounts or services needed: tests and the local server use an in-memory Postgres and record outgoing email instead of sending it. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started and [CLAUDE.md](CLAUDE.md) for the architecture and conventions.

## Self-hosting

Run the same API, SDKs, MCP server and dashboard on your own domain. Two editions, from [v0.1.1](https://github.com/send0-dev/send0-v2/releases/tag/v0.1.1):

- **Docker Compose:** Postgres, the send0 server (with its own SMTP server for inbound mail) and Caddy on one machine. Sends through any SMTP relay or Amazon SES. Image: `ghcr.io/send0-dev/send0`. Files in [`selfhost/`](selfhost).
- **Cloudflare:** one Worker on your account, with Email Routing, R2, Queues, a Durable Object, your Postgres through Hyperdrive, and Amazon SES. [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/send0-dev/send0-cloudflare).

The guide: [send0.dev/docs/self-hosting](https://send0.dev/docs/self-hosting).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md); contributors sign a [CLA](CLA.md) once, through a bot on the first pull request. For security issues, see [SECURITY.md](SECURITY.md).

## License

- The send0 server and apps are licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, you must offer its source to your users.
- The SDKs ([`packages/sdk`](packages/sdk), [`packages/sdk-python`](packages/sdk-python)) and the MCP server ([`packages/mcp`](packages/mcp)) are [MIT](packages/sdk/LICENSE), so you can use them in any project.

Copyright © 2026 Kunal Dholiya.
