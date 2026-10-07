# syntax=docker/dockerfile:1
# The self-hosted send0 server. Build from the repo root:
#   docker build -f apps/server/Dockerfile -t send0 .

# ---- build: install the workspace, build the dashboard, bundle the server into one file ----
FROM node:22-slim AS build
WORKDIR /src
ENV PNPM_HOME=/pnpm CI=true SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
RUN corepack enable

# Fetch packages from the lockfile alone, so this layer survives source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store corepack install && pnpm fetch

COPY . .
# Only the server and what it depends on (the dashboard, the API, the SDK and MCP packages).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@send0/server..."

# The API imports the SDK and MCP packages from their built dist/.
RUN pnpm --filter "@send0/mcp..." run build
RUN pnpm --filter @send0/web run build
RUN node apps/server/scripts/bundle.mjs /out/server.mjs \
 && cp -r apps/web/dist/client /out/web \
 && cp -r packages/db/migrations /out/migrations

# ---- runtime: one bundled file, the SPA and the migrations; no node_modules ----
FROM node:22-slim
LABEL org.opencontainers.image.title="send0" \
      org.opencontainers.image.description="Open-source email API where the inbox is the core object. Self-hosted server." \
      org.opencontainers.image.source="https://github.com/send0-dev/send0-v2" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

RUN groupadd --gid 10001 send0 \
 && useradd --uid 10001 --gid send0 --no-create-home --home-dir /app --shell /usr/sbin/nologin send0 \
 && mkdir -p /data/blobs \
 && chown -R send0:send0 /data \
 && printf '#!/bin/sh\nexec node /app/server.mjs "$@"\n' > /usr/local/bin/send0 \
 && chmod 755 /usr/local/bin/send0

WORKDIR /app
COPY --from=build /out/ /app/

ENV NODE_ENV=production \
    WEB_DIR=/app/web \
    MIGRATIONS_DIR=/app/migrations \
    BLOB_DIR=/data/blobs
VOLUME ["/data"]
USER send0
EXPOSE 3000 2525

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["send0"]
CMD ["start"]
