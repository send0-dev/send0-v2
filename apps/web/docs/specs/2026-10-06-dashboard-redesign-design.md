# Dashboard redesign: design

Status: approved in brainstorming on 2026-10-06. This replaces the first dashboard UI in `apps/web/src`. The Worker, auth package and deploy setup stay.

## Goals

- A dashboard that feels like Resend or Vercel: dense, quiet, monochrome, built for engineers.
- Code with clear boundaries: pages compose, hooks fetch, components render, forms validate.
- New in this version: Overview, an org-wide Messages log, a ⌘K command menu, and team members with roles and multiple workspaces.

Not in scope: billing, custom domains UI, sandbox inboxes, SSO.

## Stack

| Concern | Choice |
|---|---|
| Build and routing | Vite, React 19, React Router (library mode), routes lazy-loaded |
| Server state | TanStack Query |
| Forms | react-hook-form with zod resolvers |
| Components | shadcn/ui on Radix, Tailwind v4 tokens, `cmdk` for ⌘K, `sonner` for toasts, lucide icons |
| API client | `@send0/sdk` with `baseUrl = ${location.origin}/api` and a `fetch` that sends the session cookie |
| Auth and workspace calls | a small typed `authClient` for `/auth/*` |
| Tests | Vitest, Testing Library, MSW; server tests against the real API in-process; puppeteer end-to-end |

## Information architecture

App shell:

- Sidebar (240px, collapses to icons; a sheet on phones):
  - Workspace switcher: the current name and your role, other workspaces, and "Create workspace".
  - Overview, Inboxes, Messages, Drafts (badge with the pending count), Webhooks, API keys.
  - Settings (Workspace, Members, Account) and Docs ↗.
  - User menu at the bottom: theme, account, log out.
- Top bar: breadcrumbs, a ⌘K button, and the page's main action.

| Route | Content |
|---|---|
| `/` | Overview: usage meters (sends today against the daily cap, inboxes against the plan limit), a paused-sending banner, pending drafts, the 10 latest messages, and a getting-started checklist until it's complete |
| `/inboxes` | Table: address, display name, send policy, message count, last activity. Create in a dialog |
| `/inboxes/:id` | Split view. Left: thread list. Right: the thread (messages, SPF/DKIM/DMARC badges, prompt-injection warning, extracted OTP and links, attachments, reply composer). Inbox settings open in a sheet. The selected thread is in the URL (`?thread=`) |
| `/messages` | Org-wide table. Filters in search params: `direction`, `status`, `inbox`, `q`. Cursor paging. A row opens a detail sheet with headers, Text/HTML/Raw tabs and delivery status |
| `/drafts` | Drafts awaiting approval: Approve, Edit, Reject |
| `/webhooks`, `/webhooks/:id` | List; detail page with the delivery log (status, attempts, response) plus replay, test, rotate secret and enable/disable |
| `/api-keys` | Table; create dialog (name, scopes, inbox restriction); the key is shown once; revoke with confirmation |
| `/settings/workspace` | Rename; transfer ownership; delete the workspace |
| `/settings/members` | Members and pending invites; invite, change role, remove, leave |
| `/settings/account` | Profile, password, sign out of other sessions |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/check-email` | Split layout: the form, and a product panel |
| `/invite/:token` | Accept an invite |
| `/onboarding` | 4 steps: workspace, first inbox, API key, live "Try it" |

## Visual language

- Geist Sans and Geist Mono. 13–14px base size, tight spacing, tabular numbers for counts and times.
- Neutral greys and near-black. Orange only for focus rings and one primary highlight; status colours stay muted.
- Hairline borders. Shadows only on overlays.
- Every list has a loading skeleton shaped like its content and a designed empty state.
- Toasts for results. Destructive actions confirm in a dialog; never the browser's `confirm()`.
- Light and dark from one token set. The theme follows the system with a manual override.

## Code architecture

```
src/
  app/            providers (QueryClient, theme, toaster), router, route guards, error boundaries
  components/ui/  shadcn primitives; features never edit these
  components/     shared composites: DataTable, EmptyState, PageHeader, CopyButton,
                  ConfirmDialog, SecretReveal, RelativeTime, StatusBadge, QueryState
  lib/            api client, authClient, form helpers (toFormErrors), permissions, utils
  features/<name>/
    api/          keys.ts (query key factory) and one file per query or mutation hook
    components/   presentational pieces
    forms/        one component per form: zod schema + RHF, onSuccess passed in
    pages/        route components that only compose
```

Features: `auth`, `onboarding`, `overview`, `inboxes`, `messages`, `drafts`, `webhooks`, `api-keys`, `members`, `workspace`, `account`, `command`.

Rules:

1. Pages read route params, call feature hooks and lay out components. No fetching or business logic in components.
2. One hook per query or mutation. Keys come from the feature's key factory. A mutation invalidates exactly the keys it affects. Revoke, enable/disable and approve/reject update optimistically and roll back on error.
3. Forms: a zod schema is the single source of client validation. `applyServerError(form, error)` puts a server error's `field` on the matching input; any other error becomes the form's root error (or a toast). Submit is disabled while pending. Forms that send mail reuse one `Idempotency-Key` per submission (kept across retries after a failure), so a retry can't send twice.
4. URL holds view state: filters, selected thread, tabs.
5. Live updates: the open inbox subscribes to `GET /v1/events/stream` and invalidates its thread and message queries for events on that inbox. The onboarding "Try it" step uses `wait`.
6. Permissions: `packages/auth/src/permissions.ts` maps an action to the roles allowed; the Worker and the UI import the same table. The UI hides or disables what the role can't do; the server enforces it.
7. Every request carries the workspace the page is showing (`x-send0-workspace`). If the session has moved to another workspace (another tab switched, or the person was removed), the Worker answers 409 `workspace_changed` and the app reloads the session and drops cached data.

## Backend changes

### API (public; added to OpenAPI, the TypeScript SDK and the Python SDK)

- `GET /v1/messages`: messages across the org. Query: `inbox_id`, `direction`, `status`, `q`, `since`, `limit`, `cursor`. Same item shape as the per-inbox list. A key restricted to some inboxes sees only those inboxes.
- `PATCH /v1/drafts/:id`: edit a pending draft's `subject`, `text` and `html` before approval. Needs an admin key or a signed-in member (like approving), so an agent can't change a draft after review. Only drafts in `pending` status; others return 409.
- Approving and rejecting claim the draft atomically (`pending` → `approved`), so two people can't both send it; a decided draft returns 409. A failed send puts the draft back to `pending`.
- `GET /v1/drafts`: drafts across every inbox the key can see (the approval queue).
- `GET /v1/usage`: `{ plan, inboxes: { used, limit }, sends_today: { used, limit }, sending: { paused, reason, paused_at } }`.

### Dashboard Worker and auth

- The session carries the active workspace (`sessions.org_id`). Without it, or when the membership is gone, the server falls back to the user's oldest membership.
- `/auth/me` returns the user, the active workspace with your role, and the list of your workspaces.
- New routes:
  - `POST /auth/workspaces` creates a workspace (you become owner) and switches to it.
  - `POST /auth/workspaces/:id/switch`.
  - `PATCH /auth/workspace` renames; `DELETE /auth/workspace` deletes (owner, typed confirmation).
  - `POST /auth/workspace/transfer` (owner, to an admin).
  - `GET /auth/members`, `PATCH /auth/members/:userId` (role), `DELETE /auth/members/:userId`, `POST /auth/members/leave`.
  - `GET /auth/invites`, `POST /auth/invites`, `POST /auth/invites/:id/resend`, `DELETE /auth/invites/:id`.
  - `GET /auth/invites/:token/preview` (workspace name, inviter, email; no login needed), `POST /auth/invites/:token/accept`.
- `/api/*` checks the role against a method-and-path table before calling the gateway. The gateway gets `{ orgId, userId, role }` and sets API scopes: member gets `read` and `send`; admin and owner get `admin`.
- The Worker drops any `Authorization` header from the browser; the cookie is the only credential.
- Dashboard requests are refused for suspended or deleted orgs, the same as API keys.

### Data (migration 0003)

- `invites`: `id` (`inv_`), `org_id`, `email`, `role` (`admin` or `member`), `token_hash`, `invited_by`, `expires_at` (7 days), `accepted_at`, `revoked_at`, `created_at`. At most one open invite per org and email.
- `sessions.org_id`, nullable, references `orgs` with `ON DELETE SET NULL`.
- `orgs.deleted_at`. A deleted org's keys stop authenticating, its webhooks stop firing and its inboxes reject mail. A cleanup job purges it after 30 days.
- `members` already has `role` and a `(org_id, user_id)` primary key. A partial unique index allows exactly one owner per org; transfer locks both rows and demotes before it promotes, in one transaction.

## Roles

| Action | Owner | Admin | Member |
|---|---|---|---|
| Read inboxes, threads, messages; reply; approve or reject drafts | ✓ | ✓ | ✓ |
| Create or delete inboxes, change inbox settings | ✓ | ✓ | – |
| API keys, webhooks | ✓ | ✓ | – |
| Invite and remove members, change roles | ✓ | ✓ (cannot change or remove the owner or other admins) | – |
| Rename the workspace | ✓ | ✓ | – |
| Transfer ownership, delete the workspace | ✓ | – | – |

Members are free and unlimited for now.

## Team flows

- Invite: an admin enters an email and a role. We email a link to `/invite/:token` from noreply@send0.dev. Pending invites can be resent or revoked. Limit: 20 invites per org per day.
- Accept:
  - Logged in with the invited email: you join and switch to that workspace.
  - Logged in with another email: you see that the invite is for a different address, with a "Log out" option.
  - No account: sign-up with the email pre-filled and locked. The email counts as verified because the link proves ownership. Onboarding skips workspace creation.
- Leave: any non-owner. The owner must transfer ownership first.
- Remove: their sessions lose this workspace and fall back to another, or to onboarding if none is left.
- Delete workspace: type the name to confirm. Soft delete as described above.

## Errors and loading

- QueryClient: `staleTime` 30 s. Retry network errors and 5xx twice; never 4xx. A 401 goes to `/login?next=<path>`. A 403 renders "You don't have access to this" in place of the page.
- Every data region renders through `QueryState`: skeleton, error card with Retry, empty state, or content.
- Route-level error boundaries keep the shell alive when one view crashes.

## Testing

- Unit (Vitest, Testing Library, MSW with fixtures typed from the SDK): each form's validation and server-error mapping, key factories and invalidation, the permission map, ThreadView, MessageFilters, CommandMenu.
- Server: `GET /v1/messages` and `GET /v1/usage` (and their OpenAPI coverage); invite create, accept, wrong email, expired, revoked; switch, transfer, remove, leave, delete; the role table for every protected `/api/*` route.
- End-to-end (`apps/web/e2e/`, puppeteer against `scripts/dev-server.ts`): sign-up, verify, onboarding, live mail, messages filters, ⌘K, invite a second user who accepts in another browser and has member-only access, switching workspaces; light, dark and 400px screenshots.

Done when every suite passes, the end-to-end walk has no unexpected console errors, both tsconfigs type-check under strict, and first-load JavaScript stays under about 200 KB gzipped.

## Rollout

The new UI replaces the old one in place. Deploy order: migration 0003, then `send0-api`, then `send0-web`.
