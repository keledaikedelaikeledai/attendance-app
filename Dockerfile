# syntax=docker/dockerfile:1.7

# Multi-stage Bun-based Dockerfile optimized for PaaS (Dokku/Dokploy)
# Build and runtime use the same pinned Bun release so CI and production stay aligned.
ARG BUN_BASE_IMAGE=oven/bun:1.4.2-slim
FROM ${BUN_BASE_IMAGE} AS builder
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

# Copy source and build app with the Bun Nitro preset
COPY . .
RUN bun run build -- --preset bun

# Runtime image (minimal)
FROM ${BUN_BASE_IMAGE} AS runner
WORKDIR /app

# Install runtime native libs (keep minimal) and timezone data
RUN apt-get update && apt-get install -y --no-install-recommends \
  libstdc++6 \
  sqlite3 \
  libvips-dev \
  ca-certificates \
  tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
  && echo "Asia/Jakarta" > /etc/timezone \
  && dpkg-reconfigure -f noninteractive tzdata || true

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TZ=Asia/Jakarta

# Ensure a home directory exists and is owned by UID 1000 (we'll run as numeric UID)
RUN mkdir -p /home/app && chown -R 1000:1000 /home/app || true

# Copy only the built output and necessary runtime files from the builder
# .output already includes public assets in .output/public
COPY --from=builder --chown=1000:1000 /app/.output ./.output
COPY --from=builder --chown=1000:1000 /app/package.json ./package.json
COPY --from=builder --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /app/server/database/migrations ./server/database/migrations
COPY --from=builder --chown=1000:1000 /app/server/database/schemas ./server/database/schemas

EXPOSE ${PORT}
USER 1000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD [ -f ./.output/server/index.mjs ] || exit 1

# Run the Nitro server directly with Bun.
CMD ["/bin/sh", "-lc", "bun ./.output/server/index.mjs --port ${PORT:-3000} --host ${HOST:-0.0.0.0}"]
