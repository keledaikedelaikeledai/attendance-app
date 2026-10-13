// Syncs the MapLibre GL worker pair from the installed package into
// public/maplibre/ so the production build serves a self-contained worker:
//
//   maplibre-gl-worker.mjs  ->  imports './maplibre-gl-shared.mjs'
//
// The app sets setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'). Vite emits
// ?url-imported assets WITHOUT following their imports (a.k.a. geoql/v-maplibre#160),
// so referencing the dist worker through /_nuxt 404s the shared chunk and every
// map dies with "Worker failed to load". Copying BOTH files verbatim keeps the
// browser-served pair byte-identical to the installed maplibre-gl version —
// run after install and before build so dev and prod always agree.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'node_modules/maplibre-gl/dist')
const dest = join(root, 'public/maplibre')

mkdirSync(dest, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
  copyFileSync(join(dist, file), join(dest, file))

console.info(`[maplibre-sync] worker pair copied from maplibre-gl to public/maplibre/`)
