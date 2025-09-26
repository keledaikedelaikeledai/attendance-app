# syntax=docker/dockerfile:1.7
# Use Docker BuildKit syntax to enable features like --mount=type=cache
# This requires Docker BuildKit (DOCKER_BUILDKIT=1) or buildx in CI.
# See: https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#using-the-buildkit-syntax
# Multi-stage Bun-based Dockerfile for Nuxt 4 application
FROM oven/bun:latest AS builder
WORKDIR /app

# Install build deps required for native modules (better-sqlite3, etc.)
# Add nodejs/npm, pkg-config and libsqlite3-dev so native modules can be
# built from source in the builder. Also install node-gyp globally so
# install scripts can call it.
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  nodejs \
  npm \
  pkg-config \
  libsqlite3-dev \
  # image processing deps for sharp
  libvips-dev \
  libvips-tools \
  libjpeg-dev \
  libpng-dev \
  libcairo2-dev \
  libgif-dev \
  librsvg2-dev \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

# Install node-gyp globally so native module install scripts can find it.
RUN npm install -g node-gyp || true

# Copy lockfiles / package manifest for cached install
COPY package.json bun.lock* package-lock.json* ./

# Use BuildKit's cache mount to speed up bun installs between builds.
# Requires Docker BuildKit (DOCKER_BUILDKIT=1). The cache target (/root/.bun)
# preserves Bun's cache across build runs and makes subsequent installs much faster.
# We also pass --frozen to ensure the lockfile is respected and the install is deterministic.
ARG BUN_INSTALL_FLAGS="--frozen"
# Install dependencies. We no longer force a global build-from-source so that
# packages like sharp can download their prebuilt binaries (avoids failing
# native builds on some arches). If we later still see an ABI issue with
# better-sqlite3 we can selectively rebuild just that module.
RUN --mount=type=cache,id=bun-cache,target=/root/.bun \
  bun install $BUN_INSTALL_FLAGS || (echo 'Initial bun install failed; retrying once' >&2 && bun install $BUN_INSTALL_FLAGS)

# Copy source and build (use Bun preset for Nitro)
COPY . .
RUN bun run build -- --preset bun

### Production image
FROM oven/bun:latest AS runner
WORKDIR /app

# Runtime deps (if any native libs required)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libstdc++6 \
  sqlite3 \
  # runtime libvips present so sharp can run
  libvips-tools \
  libvips-dev \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy built output and node_modules from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
# Copy migrations so the runtime can apply them at startup
COPY --from=builder /app/server/database/migrations ./server/database/migrations
COPY --from=builder /app/server/database/schemas ./server/database/schemas

# Add entrypoint script to run migrations and seeds before starting the app
COPY ./scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port used by nuxt preview
EXPOSE 3000

# Use the entrypoint which will run migrations/seeds then exec the server
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "run", "./.output/server/index.mjs"]
