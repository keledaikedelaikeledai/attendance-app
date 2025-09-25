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

# Install dependencies with Bun (respects bun.lock)
RUN bun install

# Copy source and build (use Bun preset for Nitro)
COPY . .
RUN bun run build -- --preset bun

### Production image
FROM oven/bun:latest AS runner
WORKDIR /app

# Runtime deps (if any native libs required)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy built output and node_modules from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Expose port used by nuxt preview
EXPOSE 3000

# Default command: run the built server entry with Bun
CMD ["bun", "run", "./.output/server/index.mjs"]
