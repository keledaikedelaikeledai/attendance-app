# Attendance App

Nuxt 4 attendance tracker using:

- Better Auth (email/password + username plugin)
- Drizzle ORM
- SQLite via Turso (libSQL)
- Nuxt UI for components and styling

Includes a simple clock in/out UI with geolocation, a local activity log, and a server-side auth API powered by Better Auth + Drizzle.

## Stack

- Nuxt 4, Vue 3
- @nuxt/ui (Nuxt UI)
- better-auth (with drizzle adapter and username plugin)
- drizzle-orm + drizzle-kit
- @libsql/client (Turso/libSQL)

## Quick start

1) Install dependencies

```bash
# bun (recommended)
bun install
# Attendance App

Nuxt 4 attendance tracker using:

- Better Auth (email/password + username plugin)
- Drizzle ORM
- SQLite via Turso (libSQL)
- Nuxt UI for components and styling

Includes a simple clock in/out UI with geolocation, a local activity log, and a server-side auth API powered by Better Auth + Drizzle.

## Stack

- Nuxt 4, Vue 3
- @nuxt/ui (Nuxt UI)
- better-auth (with drizzle adapter and username plugin)
- drizzle-orm + drizzle-kit
- @libsql/client (Turso/libSQL)

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
# Turso (remote SQLite)
NUXT_DB_URL="libsql://<your-db>-<org>.turso.io"
NUXT_DB_AUTH_TOKEN="<your-turso-auth-token>"

# Or local file (no auth token required)
# NUXT_DB_URL="file:sqlite.db"
# NUXT_DB_AUTH_TOKEN=""
```

Notes:

- Drizzle is configured in `drizzle.config.ts` with dialect `turso`.
- The server uses `@libsql/client` in `server/utils/db.ts` and reads `NUXT_DB_URL` and `NUXT_DB_AUTH_TOKEN`.

3) Run migrations

```bash
# Generate SQL from schema (optional)
npx drizzle-kit generate
# Apply schema changes
npx drizzle-kit push
# Optional studio
npx drizzle-kit studio
```

Schema lives in `server/database/schema.ts` and includes Better Auth tables: `user`, `session`, `account`, `verification`.

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
- `betterAuth` with Drizzle adapter (provider: `sqlite`) wired to the local schema. Email+password enabled with the `username` plugin.
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

## Database

- Config: `drizzle.config.ts` (dialect: turso)
- Connection: `server/utils/db.ts` using `@libsql/client`
- Schema: `server/database/schema.ts`

Tables:

- `user` – basic profile and username fields
- `session` – session tokens with expiry
- `account` – provider accounts and tokens
- `verification` – verification tokens

## UI/UX

- Nuxt UI enabled in `nuxt.config.ts`, themed in `app/app.config.ts`.
- Components used: `UApp`, `UContainer`, `UCard`, `UButton`, `UFormField`, `UInput`, `UBadge`, `USelect`, `UTooltip`, `UIcon`.

Pages:

- `app/pages/index.vue` – Attendance dashboard
- Clock in/out with optional geolocation
- Shift selection (pagi/siang/sore/malam)
- Local activity log and duration
- `app/pages/register.vue` – Registration with Vee Validate + Zod
- `app/pages/login.vue` – Login scaffold (wire to Better Auth signIn.email)

Composable:

- `app/composables/useAttendance.ts`
- Persists minimal attendance state in localStorage
- Exposes `clockIn`, `clockOut`, `resetDay`, `SHIFT_DEFS`, and helpers

## Project structure (selected)

- `nuxt.config.ts` – Nuxt + modules
- `app/` – pages, middleware, composables, theming
- `server/` – API + utils
- `api/auth/[...all].ts` – Better Auth handler
- `utils/` – `auth.ts`, `db.ts`
- `database/` – Drizzle schema and migrations

## Environment

Required variables (see `.env.example`):

- `NUXT_DB_URL` – Turso URL (libsql://…) or local `file:sqlite.db`
- `NUXT_DB_AUTH_TOKEN` – Turso auth token (omit/empty for local file)

## Scripts

- `dev` – run Nuxt dev server
- `build` – build for production
- `preview` – preview production build
- `lint` – run ESLint

---

Made with Nuxt, Nuxt UI, Better Auth, Drizzle, and SQLite (Turso/libSQL).
pnpm install
