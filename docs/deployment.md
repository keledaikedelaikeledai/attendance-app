# Deployment notes (local server + Cloudflare Tunnel)

This document lists the practical steps and gotchas for deploying the attendance-app locally using Docker Compose and Cloudflare Tunnel (cloudflared). It focuses on things you must check so the app runs reliably and data persists.

## Quick summary
- Build and run the stack: `docker compose up --build`
- App listens on port `3000` inside the container and is exposed on host port `3000`.
- Cloudflared will create a tunnel and forward your public hostname to the app.
- SQLite DB is persisted to `./data/sqlite.db` on the host.

## Required environment variables
- `NUXT_DB_URL` — Database URL. For local SQLite use `file:sqlite.db` (compose sets this). For remote libSQL/Turso, set `libsql://...`.
- `NUXT_DB_AUTH_TOKEN` / `TURSO_AUTH_TOKEN` — if using a managed SQLite provider that requires auth.
- `CLOUDFLARED_TUNNEL_TOKEN` — Cloudflare tunnel token (if you run cloudflared with `--token`). Alternatively configure `cloudflared/config.yml` and mount credentials.
- `NODE_ENV=production` — recommended for production image behavior.

Put secrets in environment variables or Docker secrets, never in source control. Use `.env` and/or your orchestration secret mechanism.

## Files & mounts (persistence)
- `./data/sqlite.db` — bound to `/app/sqlite.db` in the container in the default compose setup. This file must be writable by the process inside the container.
- `./data/` — a good place for database backups, uploads or other runtime artifacts.

Before first run create the folder and file and adjust permissions:

```bash
mkdir -p ./data
touch ./data/sqlite.db
# make it writable by your user or container UID (example: UID 1000)
chmod 664 ./data/sqlite.db
# or change owner if required by your container user
sudo chown 1000:1000 ./data/sqlite.db
```

If you use a non-root user in the container, make sure the file owner/permissions match the UID the process runs as.

## Cloudflared (Cloudflare Tunnel)
- Two common ways to run cloudflared:
  - Token mode: pass a tunnel token via `--token` (our compose uses `CLOUDFLARED_TUNNEL_TOKEN`).
  - Credentials file mode: create a tunnel, save the credentials JSON, mount it in the container and use a `config.yml`.

Steps (token mode):

1. Create a tunnel in your Cloudflare account or via `cloudflared tunnel create <name>`.
2. Obtain the tunnel token or credentials file and set `CLOUDFLARED_TUNNEL_TOKEN` in your host environment or in an env-file.
3. Edit `cloudflared/config.yml` (if using credentials-file mode) to point to `http://app:3000` or `http://host.docker.internal:3000` depending on how you run cloudflared.

Example ingress entry (credentials mode):

```yaml
ingress:
  - hostname: app.example.com
    service: http://app:3000 # routes to the docker service name
  - service: http_status:404
```

Note: If cloudflared runs inside the same Docker Compose network you can use `http://app:3000` in the cloudflared config. If cloudflared runs on the host, you may need `http://host.docker.internal:3000` (Docker Desktop resolves that).

## Docker tips
- Build & run:

```bash
export CLOUDFLARED_TUNNEL_TOKEN="<token>"
docker compose up --build -d
```

Note: the Dockerfile uses Bun (oven/bun) for install/build and runtime. If you prefer npm/node change the Dockerfile back to a node base image.

- View logs:

```bash
docker compose logs -f app
docker compose logs -f cloudflared
```

- Stop and remove:

```bash
docker compose down
```

## Migrations and schema
- This project includes SQL migration files under `server/database/migrations/`. If you're using a fresh SQLite DB you can load the SQL directly:

```bash
# apply SQL files in order (example with sqlite3 CLI)
sqlite3 ./data/sqlite.db < server/database/migrations/0000_vengeful_blade.sql
sqlite3 ./data/sqlite.db < server/database/migrations/0001_attendance_tables.sql
# ...and so on
```

- Alternatively use `drizzle-kit` or your preferred migration tool. Check `drizzle.config.ts` in the repo for configuration.

## Backups
- Backup SQLite quickly:

```bash
sqlite3 ./data/sqlite.db ".backup ./data/sqlite-backup-$(date +%F).db"
```

## Troubleshooting
- App does not start / 500 errors: check `docker compose logs app` for stack traces — missing envs or inability to open sqlite file are common causes.
- DB locked errors: SQLite can produce 'database is locked' under high concurrency; for production consider a networked DB (Postgres/Turso/libSQL) or configure retries in code.
- Permissions: ensure `/app/sqlite.db` is writable by the container user.
- Cloudflared can't connect: check whether cloudflared is configured to forward to `app:3000` (compose network) or `host.docker.internal:3000` (host).

## Security & production suggestions
- Do not store secrets in the image. Use env vars, Docker secrets or your orchestration's secret manager.
- Run the app as a non-root user in the Dockerfile (optional but recommended). If you do, ensure the DB file ownership matches that user.
- Consider switching from local SQLite to a managed solution (Turso/libSQL, Postgres) for multi-node or heavy-write workloads.
- Enable Cloudflare Access / WAF rules for the hostname if exposing sensitive admin pages.

## Optional improvements
- Use Bun for smaller/faster builds (this repo has `bun.lock`); update the Dockerfile accordingly.
- Add healthchecks to `docker-compose.yml` for the `app` service.
- Add an `.env.example` documenting required env vars (I can add this file if you want).

If you want, I can:
- Update the Dockerfile to use Bun instead of npm
- Add `cloudflared/config.yml` adjusted to route to `http://app:3000`
- Commit a `.env.example` with recommended variables
