# Stage 1 : Build monorepo & native addons (better-sqlite3, sharp)
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.build.json ./packages/shared/
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/

RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      pnpm install; \
    fi

COPY packages/shared/src ./packages/shared/src
COPY apps/server/src ./apps/server/src
COPY apps/web/index.html apps/web/vite.config.ts ./apps/web/
COPY apps/web/src ./apps/web/src

RUN pnpm run build && pnpm prune --prod

# Stage 2 : Runtime minimal Debian Bookworm Slim
FROM node:22-bookworm-slim AS runner

RUN groupadd --system --gid 1001 rankroom \
  && useradd --system --uid 1001 --gid rankroom --home /app --shell /usr/sbin/nologin rankroom

WORKDIR /app

COPY --from=builder --chown=rankroom:rankroom /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=rankroom:rankroom /app/node_modules ./node_modules
COPY --from=builder --chown=rankroom:rankroom /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=rankroom:rankroom /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=rankroom:rankroom /app/packages/shared/node_modules* ./packages/shared/node_modules
COPY --from=builder --chown=rankroom:rankroom /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder --chown=rankroom:rankroom /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=rankroom:rankroom /app/apps/server/node_modules* ./apps/server/node_modules
COPY --from=builder --chown=rankroom:rankroom /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data/uploads && chown -R rankroom:rankroom /data

USER rankroom

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
