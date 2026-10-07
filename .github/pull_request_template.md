## What and why

<!-- What changes, and the reason for it. Link the issue if there is one. -->

## How it was tested

<!-- Tests added or run, and anything checked by hand (dashboard flows, a real email round trip). -->

## Checklist

- [ ] `pnpm verify` passes (format, lint, typecheck, tests)
- [ ] API changes: OpenAPI spec updated, `pnpm --filter @send0/api openapi` and both SDKs regenerated
- [ ] Schema changes: migration generated with `pnpm --filter @send0/db generate` and checked in
- [ ] Docs updated (`apps/docs/content/docs`) if behaviour visible to users changed
