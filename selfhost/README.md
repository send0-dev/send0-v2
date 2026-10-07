# Self-hosting send0

Postgres, the send0 server and Caddy on one machine, run by Docker Compose. The full guide is at
**[send0.dev/docs/self-hosting](https://send0.dev/docs/self-hosting/docker)**: DNS, mail setup, every setting, upgrades, backups
and troubleshooting.

You need a Linux server with Docker (Docker Compose v2) and inbound port 25 open, a hostname for the dashboard and API
(`DOMAIN`), a domain for your inboxes (`MAIL_DOMAIN`), and an outbound SMTP relay or Amazon SES.

## Quickstart

```sh
mkdir send0 && cd send0
for f in compose.yml Caddyfile .env.example; do
  curl -fsSLO "https://raw.githubusercontent.com/send0-dev/send0-v2/v0.1.0/selfhost/$f"
done
cp .env.example .env    # fill in DOMAIN, MAIL_DOMAIN, OWNER_EMAIL, SECRET_KEY, POSTGRES_PASSWORD, SMTP_URL
```

Point `DOMAIN` (A/AAAA) at the server and `MAIL_DOMAIN`'s MX at `DOMAIN`, add your relay's SPF and DKIM records, then:

```sh
docker compose up -d
docker compose exec send0 send0 doctor
```

Sign up at `https://DOMAIN` as `OWNER_EMAIL`. That account owns the install; everyone else joins by invite.

## Upgrades and backups

```sh
docker compose pull && docker compose up -d     # migrations run on start; pin SEND0_VERSION in .env
```

Back up the database and the `blobs` volume. See
[Upgrades, backups and troubleshooting](https://send0.dev/docs/self-hosting/operations).
