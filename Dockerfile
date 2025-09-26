# Multi-stage Bun-based Dockerfile for Nuxt 4 application
FROM oven/bun:latest AS builder
WORKDIR /app

# Install build deps required for native modules (better-sqlite3, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy lockfiles / package manifest for cached install
COPY package.json bun.lock* package-lock.json* ./

# Use BuildKit's cache mount to speed up bun installs between builds.
# Requires Docker BuildKit (DOCKER_BUILDKIT=1). The cache target (/root/.bun)
# preserves Bun's cache across build runs and makes subsequent installs much faster.
# We also pass --frozen to ensure the lockfile is respected and the install is deterministic.
ARG BUN_INSTALL_FLAGS="--frozen"
RUN --mount=type=cache,id=bun-cache,target=/root/.bun \
  bun install $BUN_INSTALL_FLAGS

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
