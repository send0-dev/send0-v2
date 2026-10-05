# @send0/www

Marketing site for send0.dev: landing page, legal pages and the waitlist API. Astro, served by a Cloudflare Worker with static assets. The waitlist is stored in D1.

## Develop

```sh
pnpm dev                    # http://localhost:4321
pnpm db:migrate:local       # create the local D1 table
pnpm preview                # build and run the real Worker locally
```

Handy URL params when checking layouts: `?theme=light|dark` forces a theme, and `?demo=0..5` freezes the hero demo on a step.

## Deploy (first time)

```sh
npx wrangler login
npx wrangler d1 create send0-waitlist   # copy the database_id into wrangler.jsonc
pnpm db:migrate:remote
pnpm deploy                             # builds and deploys; attaches send0.dev as a custom domain
```

## Read the waitlist

```sh
npx wrangler d1 execute send0-waitlist --remote --command "select email, source, country, created_at from waitlist order by created_at desc"
```

## Notes

- Waitlist form posts are protected by Astro's origin check, so requests need a matching `Origin` header.
- Content constants such as contact addresses and the repo URL live in `src/site.ts`.
