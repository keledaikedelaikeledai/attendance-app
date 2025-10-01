# Migration Guide: SQLite (Turso) to PostgreSQL

This document explains the changes made to migrate from SQLite/Turso to PostgreSQL.

## Summary of Changes

### 1. Database Configuration

**File: `drizzle.config.ts`**
- Changed `dialect` from `'turso'` to `'postgresql'`
- Changed `dbCredentials` to use `DATABASE_URL` instead of `url` and `authToken`

### 2. Database Connection

**File: `server/utils/db.ts`**
- Replaced `@libsql/client` with `pg` (node-postgres)
- Changed from `createClient()` to `Pool()`
- Updated connection to use `DATABASE_URL` environment variable

### 3. Better Auth Adapter

**File: `server/utils/auth.ts`**
- Changed provider from `'sqlite'` to `'pg'`

### 4. Schema Definitions

**Files: `server/database/schemas/auth-schema.ts` and `server/database/schemas/schema.ts`**

Changes made:
- Replaced `sqliteTable` with `pgTable`
- Replaced `integer` with appropriate PostgreSQL types:
  - `integer('field', { mode: 'boolean' })` → `boolean('field')`
  - `integer('field', { mode: 'timestamp' })` → `timestamp('field', { mode: 'date' })`
  - `integer('field')` → `integer('field')` (remains the same)
- Replaced `real` with `doublePrecision` for floating-point numbers
- Replaced `text('field', { length: N })` with `varchar('field', { length: N })`

### 5. Dependencies

**File: `package.json`**

Removed:
- `@libsql/client`
- `better-sqlite3`
- `@libsql/darwin-arm64`
- `@libsql/linux-arm64-gnu`
- `@libsql/linux-x64-gnu`

Added:
- `pg` (^8.13.1)
- `@types/pg` (^8.11.10)

### 6. Environment Variables

**Files: `.env`, `.env.example`, `.env.production`**

Changed from:
```bash
NUXT_DB_URL="libsql://..."
NUXT_DB_AUTH_TOKEN="..."
```

To:
```bash
DATABASE_URL="postgresql://user:password@host:port/database"
```

### 7. Migrations

- Old SQLite migrations backed up to `server/database/migrations.sqlite.backup/`
- New PostgreSQL migrations generated in `server/database/migrations/`
- Seed data file created: `0001_seed_shifts.sql`

### 8. Package Scripts

**File: `package.json`**

Added:
```json
{
  "db:generate": "drizzle-kit generate",
  "db:push": "drizzle-kit push",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

## Migration Steps for Existing Deployments

If you have an existing SQLite/Turso deployment with data:

### 1. Export Data from SQLite

```bash
# Export your data to JSON or CSV format
# This will depend on your current setup
```

### 2. Set Up PostgreSQL

Using Docker Compose (recommended):
```bash
docker compose up -d postgres
```

Or install PostgreSQL locally.

### 3. Update Environment Variables

Create or update `.env`:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
```

For Docker Compose:
```bash
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/postgres"
```

### 4. Run Migrations

```bash
bun install
bun run db:push
```

This will create all tables and seed the default shifts.

### 5. Import Your Data

Use `psql` or a database client to import your exported data:
```bash
psql $DATABASE_URL -f your_data.sql
```

### 6. Test the Application

```bash
bun run dev
```

## Docker Compose Deployment

The `docker-compose.yml` now includes a PostgreSQL service:

```yaml
postgres:
  image: postgres:latest
  environment:
    POSTGRES_DB: postgres
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

To deploy:

```bash
# Build and start services
docker compose up -d

# Check logs
docker compose logs -f attendance-app

# Stop services
docker compose down
```

## Troubleshooting

### Connection Issues

If you get connection errors, verify:
1. PostgreSQL is running
2. `DATABASE_URL` is correct
3. Host is `postgres` (not `localhost`) when using Docker Compose

### Migration Errors

If migrations fail:
```bash
# Reset the database (WARNING: This will delete all data)
docker compose down -v
docker compose up -d postgres
bun run db:push
```

### Check Database Connection

```bash
# Using psql
psql $DATABASE_URL

# Or via Docker
docker compose exec postgres psql -U postgres -d postgres
```

## Benefits of PostgreSQL

1. **Production-Ready**: PostgreSQL is a robust, ACID-compliant database
2. **Better Docker Support**: Easier to run in containers
3. **No External Dependencies**: No need for Turso accounts
4. **Advanced Features**: Better support for complex queries, transactions, and constraints
5. **Tooling**: Excellent ecosystem of tools and extensions

## Rollback (If Needed)

If you need to rollback to SQLite/Turso:

1. Restore the old migrations:
   ```bash
   rm -rf server/database/migrations
   mv server/database/migrations.sqlite.backup server/database/migrations
   ```

2. Restore the old dependencies and code from git history

3. Update environment variables back to Turso format

However, it's recommended to test the PostgreSQL setup thoroughly before deploying to production.
