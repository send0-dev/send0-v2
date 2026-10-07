# Security policy

send0 handles other people's email and API keys, so we take reports seriously and answer them quickly.

## Reporting a vulnerability

Email **security@send0.dev** with:

- what you found and where (endpoint, package, commit),
- steps to reproduce, or a proof of concept,
- the impact as you see it.

Please don't open a public issue, and don't access or change data that isn't yours while testing. Use your own account and inboxes.

We'll acknowledge your report within 3 working days, keep you updated while we fix it, and credit you in the release notes if you'd like.

## In scope

- The API at `api.send0.dev`, including the MCP endpoint at `/mcp`
- The dashboard at `app.send0.dev`
- Inbound mail handling for `send0.email`
- The code in this repository, including the SDKs and the MCP server

Of particular interest: tenant isolation (reaching another organization's inboxes, messages or keys), authentication and session handling, webhook signature bypasses, and ways to send mail that skip the sending policies.

## Out of scope

- Denial of service and volume-based attacks
- Spam or phishing sent _to_ a send0 inbox (that's email; report abuse to abuse@send0.email)
- Missing security headers or best-practice suggestions without a demonstrated impact
- Vulnerabilities in third-party services we use (Cloudflare, AWS, Neon); report those to the vendor
