# Self-hosting send0

One server with Postgres and Caddy, run by Docker Compose. You need a Linux host with Docker, a hostname for the dashboard and API
(`DOMAIN`), a domain for your inboxes (`MAIL_DOMAIN`), and an outbound SMTP relay (Postmark, Resend, Mailgun, SES SMTP and so on).

## Quickstart

1. **Download** the files into a directory on the server:

   ```sh
   mkdir send0 && cd send0
   for f in compose.yml Caddyfile .env.example; do
     curl -fsSLO "https://raw.githubusercontent.com/send0-dev/send0-v2/main/selfhost/$f"
   done
   ```

2. **Configure.** `cp .env.example .env`, then fill in the required values: `DOMAIN`, `MAIL_DOMAIN`, `OWNER_EMAIL`, `SECRET_KEY`
   (`openssl rand -hex 32`), `POSTGRES_PASSWORD` (`openssl rand -hex 24`) and `SMTP_URL`.

3. **DNS.** Point these records at the server:

   | Record                           | Value                                                |
   | -------------------------------- | ---------------------------------------------------- |
   | `DOMAIN` A / AAAA                | the server's public IP                               |
   | `MAIL_DOMAIN` MX                 | `10 DOMAIN`                                          |
   | `MAIL_DOMAIN` TXT                | your relay's SPF, e.g. `v=spf1 include:<relay> ~all` |
   | DKIM and DMARC for `MAIL_DOMAIN` | as your relay instructs                              |

4. **Start** it: `docker compose up -d`. Migrations run automatically. Then check the install:

   ```sh
   docker compose exec send0 send0 doctor
   ```

   It checks the config, the database, a login to the relay, the MX and SPF records, port 25 and the public URL. Warnings are worth
   reading; failures need fixing.

5. **Sign up** at `https://DOMAIN` as `OWNER_EMAIL`. That first account owns the install; everyone else joins by invite (unless you
   set `ALLOW_SIGNUP=true`).

## Upgrades

```sh
docker compose pull && docker compose up -d
```

Migrations run on start. Pin a version with `SEND0_VERSION` in `.env` to upgrade on your own schedule.

## Backups

Back up both the database and the blobs volume (raw mail and attachments):

```sh
docker compose exec -T postgres pg_dump -U send0 -Fc send0 > send0-$(date +%F).dump
docker run --rm -v send0_blobs:/data -v "$PWD":/backup alpine tar czf /backup/blobs-$(date +%F).tgz -C /data .
```

With `BLOB_DRIVER=s3`, the blobs live in your bucket instead; back that up with your provider's tools.

## Notes

- **Port 25.** Many cloud providers block inbound or outbound port 25 by default (some unblock it on request). If `doctor` can't reach
  port 25, test from another network with `nc -vz DOMAIN 25`; a failure from the server itself can also be hairpin NAT.
- **IPv6 senders.** Docker's userland proxy shows mail arriving over IPv6 as coming from the bridge IP, which breaks SPF checks for
  those senders. If that matters, use host networking for the send0 service or give Docker native IPv6.
- **Private relays.** `SMTP_URL` requires STARTTLS when it carries credentials. For a relay on a private network without TLS, add
  `?require_tls=false`.
- **The owner signs up first.** Sign-up stays closed until an account is created for `OWNER_EMAIL`, and that account must verify the
  address. So whoever controls that mailbox claims the install: set it to an address you control and sign up right after the first
  start.
