# syntax=docker/dockerfile:1.7

# Multi-stage Bun-based Dockerfile optimized for PaaS (Dokku/Dokploy)
# Build stage: installs dependencies and builds the Nuxt/Nitro output
FROM oven/bun:latest AS builder
WORKDIR /app

# Install minimal build deps needed for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  libsqlite3-dev \
  unzip \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy manifest files first for cached layer installs

COPY package.json bun.lock* package-lock.json* ./

# Use BuildKit cache for Bun to speed up installs (when supported by builder)
RUN --mount=type=cache,id=bun-cache,target=/root/.bun \
  bun install || (echo 'bun install failed, retrying...' >&2 && bun install)

# Copy source and build app
COPY . .
RUN bun run build -- --preset bun

# Runtime image (minimal)
FROM oven/bun:latest AS runner
WORKDIR /app

# Install runtime native libs (keep minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libstdc++6 \
  sqlite3 \
  libvips-dev \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user for better security in PaaS environments
RUN useradd -m -u 1000 app || true

# Copy only the built output and necessary runtime files from the builder
COPY --from=builder --chown=app:app /app/.output ./.output
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/server/database/migrations ./server/database/migrations
COPY --from=builder --chown=app:app /app/server/database/schemas ./server/database/schemas

# Copy optional entrypoint (keeps behavior consistent if present)
COPY --chown=app:app ./scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh || true

# Expose the PORT (Dokku/Dokploy will set $PORT at runtime)
EXPOSE ${PORT}

# Switch to non-root user
USER app

# Healthcheck (optional): ensures server file exists
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD [ -f ./.output/server/index.mjs ] || exit 1

# Command: run the Nitro server with Bun. PaaS platforms typically set $PORT.
CMD ["/bin/sh", "-lc", "bun ./.output/server/index.mjs --port ${PORT:-3000}"]
