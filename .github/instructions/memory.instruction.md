---
applyTo: '**'
---

# Project memory notes

- Nuxt auto-imports: Nuxt auto-imports many composables and components (useFetch, useRouter, useState, definePageMeta, etc.). Avoid adding explicit imports for symbols that Nuxt auto-imports to reduce redundant/incorrect imports and prevent build-time resolution issues. When editing server code, prefer relative imports for `server/` files rather than relying on `~` or project alias which may resolve differently in Nitro build.

- Note: `useBetterAuth` (and related Better Auth helpers) are auto-imported in this project — do not add static or dynamic imports for `useBetterAuth` in server route files. Rely on the auto-imported symbol to avoid route registration and import-resolution problems.
