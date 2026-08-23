# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: needs the dev dependencies (vite, typescript) that the running
# container must not carry.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Copied before the source so a source-only change reuses the installed layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Produces dist/client (the browser bundle) and dist/server (the Node build).
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# Read by server/config.ts. Two things hinge on it: internal error text stops
# reaching the browser, and AUTH_MODE=dev refuses to start.
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Migrations are read from <cwd>/server/db/migrations. The server does NOT apply
# them by default (MIGRATE_ON_START=false) because it connects as a
# least-privilege role that cannot issue DDL -- they are applied separately as
# the database owner. They ship anyway so a one-off `node` invocation in this
# image can run them if that is ever easier than reaching in from a laptop.
COPY server/db/migrations ./server/db/migrations

# Cloud Run overrides PORT; this documents the default the config falls back to.
EXPOSE 8080
USER node

CMD ["node", "dist/server/index.js"]
