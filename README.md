# Attendance App

Nuxt 4 attendance tracker using:

- Better Auth (email/password + username plugin)
- Drizzle ORM
- PostgreSQL
- Nuxt UI for components and styling

Includes a simple clock in/out UI with geolocation, a server-backed attendance log, and an auth API powered by Better Auth + Drizzle.

See also: docs/flowcharts.md for architecture and user flows.

## Stack

- Nuxt 4, Vue 3
- @nuxt/ui (Nuxt UI)
- better-auth (with drizzle adapter and username plugin)
- drizzle-orm + drizzle-kit
- PostgreSQL (pg driver)

## Quick start

1) Install dependencies

```bash
# bun (recommended)
bun install
# or pnpm
pnpm install
# or npm
npm install
```

2) Configure database

Create a .env file (see `.env.example`):

```ini
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"

# For Docker Compose deployment:
# DATABASE_URL="postgresql://postgres:postgres@postgres:5432/postgres"
```

Notes:

- Drizzle is configured in `drizzle.config.ts` with dialect `postgresql`.
- The server uses `pg` (node-postgres) in `server/utils/db.ts` and reads `DATABASE_URL`.

3) Run migrations

```bash
# Generate SQL from schema (optional)
bun run db:generate
# Apply schema changes
bun run db:push
# Optional studio
bun run db:studio
```

Schemas live in `server/database/schemas/` and include Better Auth tables: `user`, `session`, `account`, `verification`, plus attendance tables.

For Docker deployment, migrations are automatically applied on container startup.

4) Run the app

```bash
# dev server at http://localhost:3000
bun run dev
```

Build and preview:

```bash
bun run build
bun run preview
```

## Auth

- Server: `server/utils/auth.ts`
- `betterAuth` with Drizzle adapter (provider: `pg`) wired to the local schema. Email+password enabled with the `username` plugin.
- API route: `server/api/auth/[...all].ts`
- Proxies all auth endpoints to Better Auth.
- Client: `app/utils/auth.ts`
- Exposes `authClient` (Better Auth Vue client) with the username client plugin.
- Global middleware: `app/middleware/auth.global.ts`
- Routes are protected by default. Pages with `definePageMeta({ auth: { unauthenticatedOnly: true } })` allow guests (e.g. login/register).

Client examples (see `app/pages/register.vue`):

- Register: `authClient.signUp.email({ username, name, email, password })`
- Session: `const { data: session } = await authClient.useSession(useFetch)`

Sign-in with `authClient.signIn.email({ email, password })` and sign-out with `authClient.signOut()`.

To regenerate auth schema after changes:
```bash
bun run auth:schema
```

## Database

- Config: `drizzle.config.ts` (dialect: postgresql)
- Connection: `server/utils/db.ts` using `pg` (node-postgres)
- Schemas: `server/database/schemas/`

Tables:

- `user` – basic profile and username fields
- `session` – session tokens with expiry
- `account` – provider accounts and tokens
- `verification` – verification tokens
- `shift` – shift definitions (pagi, siang, sore, malam)
- `attendance_day` – daily attendance records
- `attendance_log` – clock in/out logs

## UI/UX

- Nuxt UI enabled in `nuxt.config.ts`, themed in `app/app.config.ts`.
- Components used: `UApp`, `UContainer`, `UCard`, `UButton`, `UFormField`, `UInput`, `UBadge`, `USelect`, `UTooltip`, `UIcon`.

Pages:

- `app/pages/index.vue` – Attendance dashboard
- Clock in/out with optional geolocation
- Shift selection backed by DB (served from `/api/shifts`)
- Activity log and duration
- `app/pages/register.vue` – Registration with Vee Validate + Zod
- `app/pages/login.vue` – Login scaffold (wire to Better Auth signIn.email)

Composable:

- `app/composables/useAttendance.ts`
- Loads shifts from DB via `/api/shifts`
- Talks to server endpoints for attendance state
- Exposes `clockIn`, `clockOut`, `resetDay`, `setShift`, `getShiftLabel`, and derived state

## Project structure (selected)

- `nuxt.config.ts` – Nuxt + modules
- `app/` – pages, middleware, composables, theming
- `server/` – API + utils
- `api/auth/[...all].ts` – Better Auth handler
- `utils/` – `auth.ts`, `db.ts`
- `database/` – Drizzle schema and migrations

## Environment

Required variables (see `.env.example`):

- `DATABASE_URL` – PostgreSQL connection string (e.g., `postgresql://user:password@host:port/database`)
- `BETTER_AUTH_SECRET` – Secret key for Better Auth
- `BETTER_AUTH_URL` – Public URL of your application

For Docker Compose deployment, use `postgres` as the hostname instead of `localhost`.

## Scripts

- `dev` – run Nuxt dev server
- `build` – build for production
- `preview` – preview production build
- `lint` – run ESLint
- `db:generate` – generate migrations from schema
- `db:push` – push schema changes to database
- `db:migrate` – run migrations
- `db:studio` – open Drizzle Studio

## Docker Deployment

The app can be deployed using Docker Compose with PostgreSQL:

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

The docker-compose.yml includes:
- PostgreSQL database
- Attendance app
- Cloudflared tunnel (optional)

---

Made with Nuxt, Nuxt UI, Better Auth, Drizzle, and PostgreSQL.
