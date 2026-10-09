# send0

Open-source, multi-tenant email API where the **inbox** is the core object. One API call gives an AI agent (or any app) an address like `name@send0.email` that can send, receive, thread replies, and push webhooks or real-time events.

This file is the working guide for people and coding agents in this repo. Private operational notes (accounts, resource IDs, current blockers) live in `CLAUDE.local.md`, which is git-ignored.

## Commands

Node 22 (`.nvmrc`), pnpm 9, Turborepo. Python SDK uses `uv`.

```bash
pnpm install
pnpm verify            # format:check + lint + check + test: run before every commit
pnpm lint              # ESLint (type-aware) on the whole repo; pnpm lint:fix to autofix
pnpm format            # Prettier --write; pnpm format:check in CI
pnpm check             # tsc / astro check in every package (also regenerates Worker types)
pnpm test              # Vitest everywhere; Postgres is in-memory PGlite, no services needed
pnpm build

# Postgres-backed tests run when TEST_DATABASE_URL is set: docker run -d --name send0-test-pg -e POSTGRES_PASSWORD=send0 -p 127.0.0.1:55432:5432 postgres:17-alpine, then TEST_DATABASE_URL=postgres://postgres:send0@127.0.0.1:55432/postgres pnpm test
pnpm --filter @send0/api test -- send.test.ts      # one package, one file
pnpm --filter @send0/web dev:local                 # whole dashboard + API locally on :5199, in-memory DB, mail recorded
pnpm --filter @send0/web e2e                       # Puppeteer walk-through against dev:local
cd packages/sdk-python && uv run pytest -q && uv run mypy src
```

A pre-commit hook (simple-git-hooks + lint-staged) runs ESLint and Prettier on staged files. CI (`.github/workflows/ci.yml`) runs the same checks plus the build and the Python SDK.

## Layout

```
apps/api         Hono REST API on Workers (api.send0.dev): routes/, sending/, webhooks/, realtime/ (Durable Object hubs), openapi/, and /mcp (remote MCP)
apps/inbound     Worker email() handler: Email Routing catch-all → raw .eml to blob store → parse → Postgres
apps/web         Dashboard (app.send0.dev): React SPA in src/, its own Worker in worker/ (auth, sessions, /api proxy to the API via a service binding)
apps/docs        Docs site (send0.dev/docs): Next.js + Fumadocs, content in content/docs/*.mdx
apps/www         Marketing site (send0.dev): Astro + D1 waitlist
packages/core    Pure TS, no I/O: MIME parsing, threading, reply extraction, OTP/link extraction, safety flags, IDs, keys, webhook signatures
packages/db      Drizzle schema, migrations, createDb(), createTestDb() (PGlite)
packages/pipeline  Inbound ingest, event envelopes, serializers shared by API and dashboard
packages/adapters  Swappable infra: blob (S3/R2), mailer (SES)
packages/auth    Dashboard accounts: AccountService, SessionService, WorkspaceService, MemberService, InviteService; permissions.ts is shared with the UI
packages/sdk     @send0/sdk (MIT). Types generated from openapi.json
packages/sdk-python  send0 on PyPI (MIT). Models generated from the same openapi.json
packages/mcp     @send0/mcp (MIT): MCP server over stdio (npx) and HTTP (handleMcpHttp)
fixtures/emails  Real-world .eml corpus used by tests (CRLF preserved; don't reformat)
```

## How requests flow

- **Inbound:** Email Routing → `apps/inbound` rejects unknown recipients during SMTP (`setReject`), stores the raw message, then `@send0/pipeline` ingests it: parse, thread, extract, write `messages`, append to the `events` outbox, notify the inbox's Durable Object hub.
- **API:** `createApp(deps)` in `apps/api/src/app.ts`. All infrastructure comes in through `AppDeps` (db, files, hub, queue, mailer, publish, now). Tests pass fakes for the same interface, so never import a Cloudflare binding inside a route.
- **Events:** outbox row → queue → webhook dispatch (signed `send0-signature: t=…,v1=…`) and real-time hub fan-out (SSE, `wait`). An hourly cron sweeps anything the queue missed.
- **Outbound:** SES, one configuration set; SES events come back via SNS → `/internal/ses-events` and feed statuses, suppressions and auto-pause.
- **Dashboard:** the SPA calls `/api/*` on its own Worker with a session cookie. The Worker checks the session, role and `x-send0-workspace` header, then calls the API's `DashboardGateway` over a service binding with a preset auth context (`actor: "user"`). The SPA uses the same `@send0/sdk` client as customers.

## Conventions

### General

- TypeScript everywhere, `strict` + `noUncheckedIndexedAccess`, ESM only. Prettier owns formatting (140 columns, double quotes); ESLint owns correctness.
- Every promise is awaited, returned, handed to `waitUntil`, or explicitly `void`ed. Workers drop unawaited work silently; `no-floating-promises` enforces this.
- One responsibility per module. Pure logic goes in `packages/core` with unit tests; I/O stays at the edges behind an interface in `packages/adapters` or `AppDeps`.
- Comments explain _why_, not what. Keep them short.
- Never commit secrets. They live in git-ignored `.dev.vars` files and `.secrets*`. Don't print them in logs or output.

### API

- IDs are prefixed (`org_`, `ibx_`, `thr_`, `msg_`, `drf_`, `att_`, `whk_`, `dom_`, `key_`, `evt_`, …) via `newId()` from `@send0/core`. API keys are `s0_live_…` / `s0_test_…`, stored hashed.
- **Every query filters by `org_id`**, and by the key's inbox list when it has one (`access.ts` loads resources the caller may see; anything else is a 404). A missing tenant filter is a security bug.
- Errors are always `{ error: { code, message, param?, request_id } }`; throw `ApiError` or a helper (`notFound`, `invalid`, `forbidden`, `conflict`) from `errors.ts`.
- Lists use cursor pagination (`pagination.ts`). Every POST honours `Idempotency-Key` (`idempotency.ts`). Inputs are validated with zod (`validation.ts`).
- Wire format is snake_case JSON; DB columns are snake_case through Drizzle's casing; TS is camelCase.
- **Changing the API surface:** update `apps/api/src/openapi/` → `pnpm --filter @send0/api openapi` (writes `packages/sdk/openapi.json`) → `pnpm --filter @send0/sdk generate` → `pnpm --filter @send0/sdk-python generate` → update SDK methods, MCP tools if relevant, and `apps/docs/content/docs/reference/`. `openapi.test.ts` fails if routes and spec drift.

### Database

- Schema in `packages/db/src/schema.ts`. After changing it, run `pnpm --filter @send0/db generate` and commit the SQL in `packages/db/migrations/`. Never edit an applied migration; add a new one.
- Production migrations: `DATABASE_URL=<direct, non-pooled URL> pnpm --filter @send0/db exec drizzle-kit migrate`.
- Tests get a fresh migrated database per file from `createTestDb()`.

### Threading

- Outbound `Message-ID` is `<msg_…@send0.email>`. Replies set `In-Reply-To` and `References` and keep the subject.
- Inbound matches on `In-Reply-To`, then any `References` ID, within the same inbox; fallback is normalized subject (strip Re/Fwd/AW/SV) plus overlapping participants within 14 days.

### Dashboard (apps/web)

- Vite + React 19, React Router data router (lazy route modules), TanStack Query for all server state, react-hook-form + zod for every form, shadcn-style primitives on `radix-ui` in `src/components/ui`, Tailwind v4.
- Code lives in feature folders: `src/features/<feature>/{api,components,forms,pages}`. `api/` holds query keys and hooks (`use-x.ts`, `use-x-mutations.ts`); pages compose; components don't fetch unless they're the feature's data boundary.
- Permissions come from `@send0/auth/permissions` (`can(role, action)`), the same table the Worker enforces. Hide what a role can't do; the server still decides.
- Side effects that must survive unmounting (toasts, navigation after a mutation) go in the mutation hook's options, not in `mutate(…, { onSuccess })`.
- Derive state during render instead of syncing it with `useEffect`. The React Hooks lint rules flag the common mistakes.
- Tests: Vitest + Testing Library + MSW for components and forms; `e2e/walk.mjs` for the full flow; `e2e/shoot.mjs` for review screenshots.

### Tests

- Write the test with the change. Pure logic in `packages/core` gets table-style unit tests; API behaviour is tested end to end through `createApp` with `setup()` from `apps/api/test/helpers.ts`.
- New inbound edge cases get a real `.eml` in `fixtures/emails/`.
- Time-dependent code takes `now()` from deps so tests can pin the clock.

## Product rules that shape code

- **Abuse controls** (`apps/api/src/sending/policy.ts`, `ses-events.ts`): the free tier is reply-only (send only to addresses that emailed the inbox, plus the owner's verified email); new orgs are capped at 50 sends/day; sending pauses automatically at 0.3% complaints or 5% hard bounces; reserved local parts (postmaster, abuse, admin, support, noreply, security, billing) can't be claimed.
- Inbound messages expose SPF/DKIM/DMARC verdicts and a prompt-injection flag (`safety`); treat email content as untrusted input everywhere, including the MCP tools.
- Sandbox inboxes (planned) go on a separate receive-only domain, `*.sandbox.send0.dev`, so `send0.email` never looks disposable to signup blocklists.
- **Cost:** fixed infrastructure must stay near $0 until there are paying customers. Prefer free tiers and pay-per-use; call out anything that adds a monthly cost.
- **Licensing:** server code is AGPL-3.0; `packages/sdk`, `packages/sdk-python` and `packages/mcp` are MIT. Contributors sign [CLA.md](CLA.md) once, enforced on pull requests by `.github/workflows/cla.yml`. Contributor-facing docs: README.md, CONTRIBUTING.md, SECURITY.md.

## Operating hosted send0

Abuse handling runs from an operator CLI against the production database. `DATABASE_URL` comes from the operator's local env; never commit or print it. Write commands print before → after and are dry runs until `--yes`; an unknown id exits non-zero. Logic in `apps/api/src/admin/`, argv in `apps/api/scripts/admin.ts`.

```sh
pnpm --filter @send0/api admin org <org_id | ibx_id | member email | inbox address>  # plan, status, cap, pause, sends, 30-day rates, inboxes, members
pnpm --filter @send0/api admin suspend-org <org_id> --reason "…" [--yes]    # API keys and dashboard refused (inbound still accepted)
pnpm --filter @send0/api admin unsuspend-org <org_id> [--yes]
pnpm --filter @send0/api admin suspend-inbox <ibx_id> --reason "…" [--yes]  # can't send, inbound refused 5.2.1, inbox.suspended webhook
pnpm --filter @send0/api admin unsuspend-inbox <ibx_id> [--yes]
pnpm --filter @send0/api admin pause-sending <org_id> --reason "…" [--yes]  # same state as the auto-pause; inbox.suspended (scope org)
pnpm --filter @send0/api admin resume-sending <org_id> [--yes]
pnpm --filter @send0/api admin set-limit <org_id> <n> [--yes]               # daily_send_limit
pnpm --filter @send0/api admin suppress <org_id> <email> [--reason manual] [--yes]
pnpm --filter @send0/api admin unsuppress <org_id> <email> [--yes]
```

Mail to `postmaster@` and `abuse@send0.email` reaches the operator: the inbound Worker forwards it with Email Routing to its `OPERATOR_FORWARD_TO` secret (`wrangler secret put OPERATOR_FORWARD_TO` in apps/inbound; kept out of the public repo), which must be a verified destination address in the Cloudflare account. Other reserved names are still refused. Each forward logs `message.forwarded_to_operator`. Self-hosted installs use the same var (Docker relays through its mailer; see the self-hosting docs).

Daily caps also rise on their own (`apps/api/src/send-caps.ts`, hourly cron, hosted limits only): `daily_send_limit` doubles, up to free 200 / pro 2,000 / scale 10,000, for active, unpaused orgs older than 3 days with ≥ 20 sends in 7 days, a busiest UTC day at ≥ 80% of the cap, and < 2% hard bounces and < 0.1% complaints over 30 days. It logs `org.limit_raised`, never lowers a cap, and leaves caps set above the ceiling by hand alone.

Retention (`apps/api/src/retention.ts`, the same hourly cron; also scheduled in apps/server and apps/cloudflare) keeps stored mail inside Neon's free tier without losing sending history. Once a message is older than its inbox's `retention_days` (1–30, default 7) it is **scrubbed**: text, html, extracted fields, attachment rows and `raw_key` go, `scrubbed_at` is set, and the API returns it with `"expired": true`. Direction, status, addresses, subject and threading headers stay, because auto-pause and cap raises read 30 days of outbound status and reply-only reads inbound senders. After **35 days** the row is deleted, threads left empty are deleted, and `events` and `deliveries` older than 35 days are pruned. It works oldest first in batches of 1,000 within a 20-second budget and logs one `retention` line when it changed anything.

The hosted Workers' S3 credentials can't delete, so raw mail and attachments expire through a bucket lifecycle rule instead, 35 days after upload. `put-bucket-lifecycle-configuration` replaces the bucket's whole lifecycle configuration, so check for an existing one first (`aws s3api get-bucket-lifecycle-configuration --profile default --region ap-south-1 --bucket send0-raw-mail-aps1`):

```sh
aws s3api put-bucket-lifecycle-configuration --profile default --region ap-south-1 --bucket send0-raw-mail-aps1 \
  --lifecycle-configuration '{"Rules":[
    {"ID":"expire-raw-mail","Filter":{"Prefix":"raw/"},"Status":"Enabled","Expiration":{"Days":35}},
    {"ID":"expire-attachments","Filter":{"Prefix":"att/"},"Status":"Enabled","Expiration":{"Days":35}}]}'
```

## Releasing

First set every published package to the release version and commit it: `node scripts/release-version.mjs 0.2.0`, then `uv lock` in `packages/sdk-python`, `packages/langchain-python` and `examples/langchain-python-agent`. Then tag `vX.Y.Z` (or `vX.Y.Z-rc.N`) on `main` and push the tag (`git tag v0.2.0 && git push origin v0.2.0`). `.github/workflows/release.yml` then publishes:

- **Docker:** `ghcr.io/send0-dev/send0` for linux/amd64 and linux/arm64, tagged `X.Y.Z`, `X.Y`, `latest` and `sha-…` (a pre-release gets only its full version).
- **Deploy to Cloudflare template:** `apps/cloudflare/scripts/build-template.mjs` builds a self-contained folder (prebuilt Worker, dashboard, `wrangler.jsonc`, README), which is force-pushed as one commit to `main` of `send0-dev/send0-cloudflare`. Build it locally with `pnpm --filter @send0/cloudflare template /tmp/send0-cloudflare` (a relative path is relative to `apps/cloudflare`).
- **npm:** `@send0/sdk`, `@send0/mcp`, `@send0/ai-sdk` and `@send0/langchain`, with provenance (pre-releases under the `next` dist-tag). `@send0/agent-tools` is private and bundled into the others.
- **PyPI:** `send0` and `langchain-send0`, through trusted publishing from the `pypi` environment.

Both publish jobs refuse to run unless every package version matches the tag (`release-version.mjs --check`), and skip versions the registry already has.

To publish an existing tag again, run the workflow by hand (Actions > Release > Run workflow) with the tag.

One-time setup:

1. Create the public repo `send0-dev/send0-cloudflare`.
2. Make an SSH key (`ssh-keygen -t ed25519 -C send0-release -f template_deploy_key -N ""`). Add the public half to send0-cloudflare as a deploy key with write access, and the private half to send0-v2 as the Actions secret `TEMPLATE_DEPLOY_KEY`. Without the secret, the template job skips with a notice.
3. After the first release, make the `send0` container package public (org > Packages > send0 > Package settings > Change visibility) and connect it to the send0-v2 repository.
4. npm: the `@send0` org belongs to the npm user `dev-send0`. A granular token with read and write on the `@send0` scope (bypassing 2FA) is the Actions secret `NPM_TOKEN`; it expires after at most 90 days.
5. PyPI: `send0` and `langchain-send0` trust this repo's `release.yml` in the GitHub environment `pypi`.

## Git

- Branch from `main`; keep commits focused. Messages are an imperative sentence describing the change (`Add the remote MCP endpoint`, `Fix docs search 404s`), with a body explaining why when it isn't obvious.
- Don't add AI or tool attribution (no `Co-Authored-By` for tools, no "Generated with" footers) to commits, PRs, code or docs.
- `pnpm verify` must pass before pushing. Deploys are manual (`pnpm --filter <app> run deploy`; plain `pnpm deploy` is a different pnpm command) and done by a maintainer.
