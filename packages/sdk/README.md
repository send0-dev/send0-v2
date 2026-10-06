# @send0/sdk

The official TypeScript SDK for [send0](https://send0.dev): email inboxes for AI agents.

Works in Node 18+, Bun, Deno, Cloudflare Workers and browsers. No dependencies.

```sh
npm install @send0/sdk
```

## Give an agent an inbox and read the verification code

```ts
import { Send0 } from "@send0/sdk";

const send0 = new Send0(process.env.SEND0_API_KEY);

const inbox = await send0.inboxes.create({ name: "signup-agent" });
// → signup-agent@send0.email

await browser.fill("#email", inbox.address);
await browser.click("Create account");

// Blocks until the email lands (up to 60s here), then returns it with the code already extracted.
const msg = await send0.inboxes.wait(inbox.id, { from: "*@github.com", timeout: 60 });
console.log(msg?.extracted?.otp);         // "482913"
console.log(msg?.extracted?.action_link); // "https://github.com/verify?..."
```

## Reply in the same thread

```ts
const reply = await send0.messages.reply(msg.id, { text: "Thanks, confirmed." });
```

Replies carry the right `In-Reply-To` and `References`, so they thread in Gmail and Outlook. For inboxes with `send_policy: "approval"`, sends return a draft instead. Check with `isDraft(result)`.

## Read and search

```ts
for await (const m of await send0.messages.list(inbox.id, { q: "invoice", from: "*@acme.com" })) {
  console.log(m.subject, m.extracted_text); // reply text without quoted history
}

const thread = await send0.threads.get(inbox.id, msg.thread_id); // messages oldest first
const { download_url } = await send0.messages.attachment(msg.id, msg.attachments[0].id);
```

Lists return a `Page`. Iterate it with `for await` to walk every page automatically.

## Real-time events

```ts
for await (const event of send0.events.stream({ inboxId: inbox.id })) {
  if (event.type === "message.received") console.log(event.data.subject);
}
```

The stream reconnects on its own and resumes from the last event it saw.

## Webhooks

```ts
const hook = await send0.webhooks.create({ url: "https://example.com/hooks/send0", events: ["message.received"] });
// Store hook.secret. It's only shown once.

// In your handler, with the raw request body:
import { verifyWebhook } from "@send0/sdk";
const ok = await verifyWebhook(rawBody, req.headers.get("send0-signature"), process.env.SEND0_WEBHOOK_SECRET!);
```

## Errors, retries and idempotency

Failed requests throw `Send0Error` with `status`, `code` (e.g. `recipient_not_allowed`, `daily_limit_reached`), `message` and `requestId`.

Network errors, `429` and `5xx` are retried twice with backoff by default (`maxRetries`). Every POST carries an `Idempotency-Key`, so a retried send never goes out twice.

```ts
const send0 = new Send0({ apiKey, maxRetries: 3, timeout: 30_000 });
```

## Test keys

`s0_test_…` keys go through every check but never send real mail. Use them in CI.

## License

MIT
