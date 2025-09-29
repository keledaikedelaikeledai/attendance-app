# syntax=docker/dockerfile:1.7

# Multi-stage Bun-based Dockerfile optimized for PaaS (Dokku/Dokploy)
# Build stage: installs dependencies and builds the Nuxt/Nitro output
FROM oven/bun:latest AS builder
WORKDIR /app

# Ensure apt is non-interactive during automated builds and install build deps
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV LANG=C.UTF-8

# Install minimal build deps needed for native modules
RUN apt-get update && apt-get install -yq --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  libsqlite3-dev \
  unzip \
  ca-certificates \
  fonts-dejavu-core \
  fontconfig \
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
# Try to create the user with useradd; if the base image doesn't provide it
# (some minimal images omit useradd), fall back to appending entries to
# /etc/passwd and /etc/group and creating the home directory.
RUN if id -u app >/dev/null 2>&1; then \
      echo "user app already exists"; \
    else \
      if command -v useradd >/dev/null 2>&1; then \
        useradd -m -u 1000 app; \
      else \
        echo 'app:x:1000:1000:app:/home/app:/bin/sh' >> /etc/passwd; \
        echo 'app:x:1000:' >> /etc/group || true; \
        mkdir -p /home/app; \
        chown 1000:1000 /home/app || true; \
      fi; \
    fi

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
