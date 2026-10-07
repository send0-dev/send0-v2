# Contributing to send0

Thanks for helping. Bug reports, fixes, docs and new `.eml` edge cases are all welcome.

## Before you start

- **Bugs:** open an issue with what you did, what you expected and what happened. For parsing or threading bugs, attach the raw `.eml` (strip anything private).
- **Features:** open an issue first so we can agree on the shape before you write code. The API is versioned and changes ripple into two SDKs, the MCP server and the docs.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setup

You need Node 22 (see `.nvmrc`), pnpm 9 and, for the Python SDK, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install          # also installs the pre-commit hook
pnpm verify           # format check, lint, typecheck, tests
```

Tests need no services or credentials. Postgres runs in memory (PGlite) and email is faked. To click through the whole product locally:

```bash
pnpm --filter @send0/web dev:local   # dashboard + API on http://localhost:5199
```

[CLAUDE.md](CLAUDE.md) is the guide to the codebase: layout, how requests flow, and the conventions for the API, database, dashboard and tests. Read it before a larger change.

## Making a change

1. Branch from `main`.
2. Write the test with the change. Inbound edge cases get a real `.eml` in `fixtures/emails/`.
3. If you changed the API, update the OpenAPI spec and regenerate the SDKs (steps in CLAUDE.md). CI fails if the spec and routes drift.
4. If you changed the database schema, run `pnpm --filter @send0/db generate` and commit the migration.
5. Update the docs in `apps/docs/content/docs` when users would notice the change.
6. Run `pnpm verify` and open a pull request. Describe what changed, why, and how you tested it.

Commit messages are a short imperative sentence (`Fix threading for Outlook replies without References`), with a body when the reason isn't obvious.

## Contributor License Agreement

Before your first pull request can be merged, you need to sign the [Contributor License Agreement](CLA.md). A bot comments on the pull request with a sentence to reply with; you only sign once.

The CLA keeps the project's licensing flexible: the server is AGPL-3.0, the SDKs and MCP server are MIT, and the CLA lets send0 offer other terms (such as a commercial license) without tracking down every contributor. You keep the copyright in your work.

## License

By contributing, you agree that your contributions are licensed under the license of the package they're in: AGPL-3.0 for the server and apps, MIT for `packages/sdk`, `packages/sdk-python` and `packages/mcp`, together with the rights in the CLA.
