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
- **Licensing:** server code is AGPL-3.0; `packages/sdk`, `packages/sdk-python` and `packages/mcp` are MIT. Contributions go through a CLA.

## Git

- Branch from `main`; keep commits focused. Messages are an imperative sentence describing the change (`Add the remote MCP endpoint`, `Fix docs search 404s`), with a body explaining why when it isn't obvious.
- Don't add AI or tool attribution (no `Co-Authored-By` for tools, no "Generated with" footers) to commits, PRs, code or docs.
- `pnpm verify` must pass before pushing. Deploys are manual (`pnpm --filter <app> run deploy`; plain `pnpm deploy` is a different pnpm command) and done by a maintainer.
