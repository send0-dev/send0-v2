# @send0/inbound

Cloudflare Worker that receives mail for `*@send0.email` through Email Routing.

For each message it:

1. Checks the recipient while the SMTP session is open. Unknown, reserved and foreign addresses are refused with a 5xx, so we never accept mail we'd have to bounce.
2. Writes the raw `.eml` to R2 (`send0-raw-mail`, key `raw/YYYY/MM/DD/msg_….eml`) before anything else.
3. Parses it with `@send0/core` (threading ids, reply text, codes and links, SPF/DKIM/DMARC, prompt-injection flag) and logs a JSON summary.

Milestone 1 has no database: accepted inboxes come from `ALLOWED_INBOXES` in `wrangler.jsonc`.

## Develop

```sh
pnpm test
pnpm dev
# simulate an inbound message against the local Worker
curl -X POST "localhost:8787/cdn-cgi/handler/email?from=a@gmail.com&to=test@send0.email" \
  --data-binary @../../fixtures/emails/gmail-reply.eml
```

## Deploy (first time)

```sh
npx wrangler r2 bucket create send0-raw-mail
pnpm run deploy
```

Then in the Cloudflare dashboard, open send0.email, go to Email, then Email Routing. Enable it, and set the catch-all address to "Send to a Worker" with `send0-inbound`.

## Logs

```sh
npx wrangler tail send0-inbound --format pretty
```
