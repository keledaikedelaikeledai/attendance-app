<script setup lang="ts">
import type { DropdownItem } from '@sewadah/selaras/types'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useI18n } from 'vue-i18n'
import 'maplibre-gl/dist/maplibre-gl.css'

definePageMeta({
  title: 'Geofence',
  pageTitle: 'Geofence - Admin - Attendance App',
})

const { t } = useI18n()

const toast = useToast()

const { data, pending, refresh } = useFetch('/api/admin/geofences', { method: 'get', credentials: 'include' })

const geofences = computed<any[]>(() => (data.value as any)?.geofences ?? [])
const selectedId = ref<string | null>(null)
const mode = ref<'view' | 'edit' | 'create'>('view')
const isReadOnly = computed(() => mode.value === 'view')

const name = ref('')
const isActive = ref(false)
const interactionPolicy = ref<'disallow' | 'allow' | 'allow_with_comment'>('disallow')
const geofenceType = ref<'point' | 'polygon'>('point')
// Computed rather than constant so the labels follow the active locale - the
// page used to render these as literal English.
const geofenceItems = computed(() => [
  { label: t('adminGeofence.form.type.point'), value: 'point' },
  { label: t('adminGeofence.form.type.polygon'), value: 'polygon' },
])
const policyItems = computed(() => [
  { label: t('adminGeofence.form.policy.disallow'), value: 'disallow' },
  { label: t('adminGeofence.form.policy.allow'), value: 'allow' },
  { label: t('adminGeofence.form.policy.allowWithComment'), value: 'allow_with_comment' },
])
// The map tool, not the server's `interactionMode`. Renamed from that, which
// collided: the API field means the outside-interaction policy.
const mapToolItems = computed(() => [
  { label: t('adminGeofence.map.tool.move'), value: 'move', icon: 'i-lucide-hand' },
  { label: t('adminGeofence.map.tool.draw'), value: 'add', icon: 'i-lucide-pen-tool' },
])
const mapTool = ref<'move' | 'add'>('move')
const radiusMeters = ref<number | null>(100)
const pointRadiusBackup = ref<number | null>(100)
const center = ref<{ lat: number, lng: number } | null>(null)
const polygon = ref<Array<[number, number]>>([])
const saving = ref(false)
const showDelete = ref(false)
const deleteTarget = ref<any | null>(null)
const isLoading = computed(() => Boolean(pending.value))
const isRadiusEditable = computed(() => geofenceType.value === 'point')
const isApplyingConfig = ref(false)

const defaultCenter: [number, number] = [-6.2, 106.816666]

// The row itself is the View action - selecting a geofence already loads it
// read-only - so Edit and Delete are all that is left for the overflow menu.
function rowMenuItems(fence: any): DropdownItem[][] {
  return [
    [
      {
        label: t('adminGeofence.actions.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => applyGeofence(fence, 'edit'),
      },
      {
        label: t('adminGeofence.actions.delete'),
        icon: 'i-lucide-trash',
        destructive: true,
        onSelect: () => confirmDelete(fence),
      },
    ],
  ]
}

function fenceName(fence: any) {
  return fence?.name || t('adminGeofence.list.untitled')
}

// The API stores the policy in a column called `interactionMode`, which is
// unrelated to the map tool above. Translated rather than printed raw,
// because the stored values read as allow_with_comment.
function policyLabel(mode: string) {
  if (mode === 'allow')
    return t('adminGeofence.badge.allow')
  if (mode === 'allow_with_comment')
    return t('adminGeofence.badge.allowWithComment')
  return t('adminGeofence.badge.disallow')
}

watch(
  () => geofences.value,
  (list) => {
    if (!list.length) return
    if (!selectedId.value) {
      applyGeofence(list[0], 'view')
    }
  },
  { immediate: true },
)

watch(
  () => geofenceType.value,
  (val, prev) => {
    if (isApplyingConfig.value || val === prev)
      return
    mapTool.value = 'move'
    if (val === 'polygon') {
      center.value = null
      pointRadiusBackup.value = radiusMeters.value ?? pointRadiusBackup.value
      radiusMeters.value = 0
      polygon.value = []
    }
    else {
      radiusMeters.value = pointRadiusBackup.value ?? 100
      polygon.value = []
    }
  },
)

watch(
  () => isReadOnly.value,
  (val) => {
    if (val)
      mapTool.value = 'move'
  },
)

const mapCenter = computed<[number, number]>(() => {
  // MapLibre and GeoJSON both want [lng, lat]. Storage stays [lat, lng] to
  // match the rows already in the database, so swap at this boundary only.
  if (geofenceType.value === 'point' && center.value)
    return [center.value.lng, center.value.lat]
  if (polygon.value.length) {
    const sum = polygon.value.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0])
    const n = polygon.value.length
    return [sum[1] / n, sum[0] / n]
  }
  return [defaultCenter[1], defaultCenter[0]]
})

const mapZoom = computed(() => {
  if (geofenceType.value === 'point')
    return center.value ? 16 : 12
  return 12
})

// ---------------------------------------------------------------------------
// MapLibre. Same engine and same OpenFreeMap styles as the home page, so the
// two maps cannot drift apart.
//
// The map is built once and then moved with jumpTo. It used to be rebuilt from
// scratch on every change: `mapKey` interpolated polygon.length and was bound
// as :key on <LMap>, so placing a single vertex remounted the entire map, tiles
// and all. That is also why the old page needed a manual move/draw toggle -
// any state the map held internally was discarded each time.
//
// The editable shape lives in Terra Draw, which owns the store, the handles
// and the interactions. The GeoJSON layers below only draw the radius ring of
// a point geofence: that is derived from the form, not a shape you trace.
// ---------------------------------------------------------------------------
const mapContainer = ref<HTMLElement | null>(null)
let map: import('maplibre-gl').Map | null = null
let mapLib: any = null
let terraDraw: any = null
let drawStarted = false
let writingDraw = false
let suppressPush = false

const colorMode = useColorMode()
const mapStyle = computed(() => colorMode.value === 'dark'
  ? 'https://tiles.openfreemap.org/styles/fiord'
  : 'https://tiles.openfreemap.org/styles/positron')

const SOURCE_ID = 'geofence'
const LAYER_FILL = 'geofence-fill'
const LAYER_LINE = 'geofence-line'

const fillColor = computed(() => colorMode.value === 'dark' ? '#60a5fa' : '#2563eb')
const strokeColor = computed(() => isActive.value ? fillColor.value : '#9ca3af')

function addGeofenceLayers() {
  const m = map
  if (!m)
    return
  if (!m.getSource(SOURCE_ID))
    m.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!m.getLayer(LAYER_FILL)) {
    m.addLayer({
      id: LAYER_FILL,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': fillColor.value, 'fill-opacity': isActive.value ? 0.18 : 0.1 },
    })
  }
  if (!m.getLayer(LAYER_LINE)) {
    m.addLayer({
      id: LAYER_LINE,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': strokeColor.value,
        'line-width': 2,
      },
    })
  }
  pushToMap()
}

// ---------------------------------------------------------------------------
// Terra Draw owns the shape you are editing: the store, the vertex handles, the
// midpoints, the drag and the delete. The page keeps `polygon` / `center` as
// the saved contract, because that is what the API takes, and mirrors them
// into the store in both directions.
//
// Two guards stop the mirror feeding itself:
//   `writingDraw`   - set while we write the store. Terra Draw fires `change`
//                     synchronously from inside clear() and addFeatures().
//   `suppressPush`  - set while we write Vue state from Terra Draw. The state
//                     watcher uses `flush: 'sync'`, so it still runs under this
//                     flag; the flag is dropped on nextTick, after that flush.
// ---------------------------------------------------------------------------
const drawMode = computed<string>(() => {
  if (isReadOnly.value)
    return 'render'
  if (mapTool.value !== 'add')
    return 'select'
  return geofenceType.value === 'polygon' ? 'polygon' : 'point'
})

// Terra Draw paints these on top of its own layers, so they follow the theme
// the same way the radius ring does. Re-applied on every colour or isActive
// change: mode styles are plain values, not reactive.
function drawStyles() {
  const fill = fillColor.value
  const stroke = strokeColor.value
  const fillOpacity = isActive.value ? 0.18 : 0.1
  return {
    render: {
      polygonFillColor: fill,
      polygonFillOpacity: fillOpacity,
      polygonOutlineColor: stroke,
      polygonOutlineWidth: 2,
      lineStringColor: stroke,
      lineStringWidth: 2,
      lineStringOpacity: 1,
      pointColor: stroke,
      pointWidth: 8,
      pointOpacity: 1,
      pointOutlineColor: '#ffffff',
      pointOutlineWidth: 2,
      pointOutlineOpacity: 1,
      zIndex: 0,
    },
    polygon: {
      fillColor: fill,
      fillOpacity,
      outlineColor: stroke,
      outlineOpacity: 1,
      outlineWidth: 2,
      closingPointColor: stroke,
      closingPointWidth: 9,
      closingPointOpacity: 1,
      closingPointOutlineColor: '#ffffff',
      closingPointOutlineWidth: 2,
      closingPointOutlineOpacity: 1,
      coordinatePointColor: stroke,
      coordinatePointWidth: 7,
      coordinatePointOpacity: 1,
      coordinatePointOutlineColor: '#ffffff',
      coordinatePointOutlineWidth: 2,
      coordinatePointOutlineOpacity: 1,
    },
    point: {
      pointColor: stroke,
      pointWidth: 9,
      pointOpacity: 1,
      pointOutlineColor: '#ffffff',
      pointOutlineWidth: 2,
      pointOutlineOpacity: 1,
      editedPointColor: stroke,
      editedPointWidth: 9,
      editedPointOutlineColor: '#ffffff',
      editedPointOutlineWidth: 2,
    },
    select: {
      selectedPolygonColor: stroke,
      selectedPolygonFillOpacity: fillOpacity,
      selectedPolygonOutlineColor: stroke,
      selectedPolygonOutlineWidth: 2,
      selectedLineStringColor: stroke,
      selectedLineStringWidth: 2,
      selectedPointColor: stroke,
      selectedPointWidth: 9,
      selectedPointOutlineColor: '#ffffff',
      selectedPointOutlineWidth: 2,
      // Empty string, not the default: Terra Draw's default selected marker is
      // a PNG on raw.githubusercontent.com. One outbound request we do not need.
      selectedMarkerUrl: '',
      selectionPointColor: '#ffffff',
      selectionPointWidth: 8,
      selectionPointOutlineColor: stroke,
      selectionPointOutlineWidth: 2,
      midPointColor: '#ffffff',
      midPointWidth: 7,
      midPointOutlineColor: stroke,
      midPointOutlineWidth: 2,
    },
  }
}

// Which parts of a feature may be dragged or deleted, per mode.
const drawFlags = {
  polygon: {
    feature: {
      draggable: false,
      rotateable: false,
      scaleable: false,
      coordinates: { draggable: true, midpoints: true, deletable: true, snappable: false },
    },
  },
  point: {
    feature: {
      draggable: true,
      coordinates: { draggable: true, midpoints: false, deletable: true, snappable: false },
    },
  },
}

// One place, because Terra Draw's updateOptions drops any option you leave
// out: passing styles alone would silently blank `keyEvents` and `flags`.
function applyDrawOptions() {
  if (!terraDraw || !drawStarted)
    return
  const styles = drawStyles()
  terraDraw.updateModeOptions('render', { styles: styles.render })
  terraDraw.updateModeOptions('polygon', {
    styles: styles.polygon,
    keyEvents: { cancel: 'Escape', finish: 'Enter' },
    showCoordinatePoints: true,
  })
  terraDraw.updateModeOptions('point', { styles: styles.point })
  terraDraw.updateModeOptions('select', { styles: styles.select, flags: drawFlags })
}

// Guidance features Terra Draw parks in the store beside your geometry:
// closing points, snapping points, coordinate points, selection handles. They
// are Points, so a geometry-type test alone would read them as your shape.
const GUIDANCE_PROPS = [
  'closingPoint',
  'snappingPoint',
  'coordinatePoint',
  'midPoint',
  'selectionPoint',
  'edited',
  'marker',
]

// Guidance handles Terra Draw parks in the store beside your geometry. The two
// branches differ on purpose. For a polygon, geometry type alone is enough -
// every handle is a Point - and property tests are unsafe, because the polygon
// itself carries `coordinatePointIds`, a pointer to its own handles. Filtering
// on that rejected the real shape, so the mirror read "nothing here" and the
// next push cleared the store. The point branch has to test properties, since
// its shape is a Point like the handles; `mode` stays 'point' on the real
// feature even when it is selected.
function shapeFeatures(snapshot: any[]): any[] {
  return snapshot.filter((f: any) => {
    const geometry = f?.geometry
    if (geofenceType.value !== 'point')
      return geometry?.type === 'Polygon'
    if (geometry?.type !== 'Point')
      return false
    const props = f?.properties ?? {}
    if (props.mode === 'select')
      return false
    return !GUIDANCE_PROPS.some(key => props[key])
  })
}

// Terra Draw keeps a drawn ring closed (last point repeats the first); the
// saved contract does not. Drop the repeat so the two forms compare equal and
// a closed ring is not saved with a duplicate vertex.
function openRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2)
    return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return (first[0] === last[0] && first[1] === last[1]) ? ring.slice(0, -1) : ring
}

// Terra Draw validates each coordinate's decimal places against its precision
// (default 9). The DB keeps full-precision floats, which the validator rejects
// as "excessive precision" and silently drops. Round to that grid before
// pushing, so the pushed polygon, the store, and what we read back agree.
function roundToCoordinatePrecision(n: number): number {
  return Math.round(n * 1e9) / 1e9
}

// Terra Draw validates feature ids as UUIDs (length 36) and silently drops
// anything else, which used to leave the store empty with no error.
const SHAPE_ID = '00000000-0000-4000-8000-000000000000'

function desiredFeatures(): any[] {
  if (geofenceType.value === 'point') {
    if (!center.value)
      return []
    return [{
      type: 'Feature',
      id: SHAPE_ID,
      properties: { mode: 'point' },
      geometry: { type: 'Point', coordinates: [roundToCoordinatePrecision(center.value.lng), roundToCoordinatePrecision(center.value.lat)] },
    }]
  }
  if (polygon.value.length < 3)
    return []
  return [{
    type: 'Feature',
    id: SHAPE_ID,
    properties: { mode: 'polygon' },
    geometry: {
      type: 'Polygon',
      coordinates: [closed(polygon.value.map(([lat, lng]) => [roundToCoordinatePrecision(lng), roundToCoordinatePrecision(lat)]))],
    },
  }]
}

// Canonical form of a shape, so the store and Vue state can be compared
// without caring about ring closure or coordinate order.
function shapeKey(feature: any): string {
  if (!feature)
    return ''
  const geometry = feature.geometry
  if (geometry?.type === 'Point')
    return `point:${geometry.coordinates[0]},${geometry.coordinates[1]}`
  if (geometry?.type === 'Polygon') {
    const ring = openRing(geometry.coordinates[0])
    return `polygon:${ring.map(c => `${c[0]},${c[1]}`).join('|')}`
  }
  return ''
}

// Vue state -> store. Runs when something outside Terra Draw moved the shape:
// loading a fence, switching type, pressing Clear.
function pushStateIntoDraw() {
  if (!terraDraw || !drawStarted || writingDraw || suppressPush)
    return
  const want = desiredFeatures()
  const have = shapeFeatures(terraDraw.getSnapshot())
  if (shapeKey(want[0]) === shapeKey(have[0]) && want.length === have.length)
    return
  writingDraw = true
  try {
    terraDraw.clear()
    if (want.length)
      terraDraw.addFeatures(want)
  }
  finally {
    writingDraw = false
  }
}

// Store -> Vue state. Runs on every Terra Draw `change`: drawing a vertex,
// dragging one, inserting a midpoint, deleting.
function readDrawIntoState() {
  if (!terraDraw || writingDraw)
    return
  const [feature] = shapeFeatures(terraDraw.getSnapshot())
  suppressPush = true
  if (geofenceType.value === 'point') {
    const coordinates = feature?.geometry?.coordinates
    center.value = coordinates ? { lat: coordinates[1], lng: coordinates[0] } : null
  }
  else if (feature) {
    polygon.value = openRing(feature.geometry.coordinates[0])
      .map(([lng, lat]) => [lat, lng] as [number, number])
  }
  else {
    polygon.value = []
  }
  nextTick(() => {
    suppressPush = false
  })
}

function applyDrawMode() {
  if (!terraDraw || !drawStarted)
    return
  const next = drawMode.value
  if (terraDraw.getMode() === 'polygon' && next !== 'polygon') {
    // Leaving Draw calls the mode's cleanUp, which deletes the polygon it had
    // not closed yet. Close it first; a run with too few vertices cannot be
    // closed and Terra Draw cannot store it either, so drop it here rather than
    // leave a vertex count the map does not show.
    if (polygon.value.length >= 3)
      finishPolygon()
    else if (polygon.value.length)
      polygon.value = []
  }
  terraDraw.setMode(next)
  // cleanUp still runs inside setMode, so hand back whatever the form holds.
  // The suppress flag is lifted for this one call: finishPolygon just raised a
  // change event, and that flag is what stops this very write from echoing.
  const heldBack = suppressPush
  suppressPush = false
  try {
    pushStateIntoDraw()
  }
  finally {
    suppressPush = heldBack
  }
}

// setStyle on a theme switch destroys the adapter's source and layers along
// with everything else. stop() unregisters and start() rebuilds them; the
// store is untouched, so the shape survives the switch.
function restartDraw() {
  if (!terraDraw || !map)
    return
  try {
    if (drawStarted)
      terraDraw.stop()
    terraDraw.start()
    drawStarted = true
    applyDrawOptions()
    pushStateIntoDraw()
    applyDrawMode()
  }
  catch (err) {
    useErrorReporter().captureException(err, { context: 'geofence-draw-init' })
    drawStarted = false
  }
}

// Both events: 'load' covers the first paint, 'style.load' covers the theme
// switch that tears the adapter down again.
function onMapReady() {
  addGeofenceLayers()
  restartDraw()
}

let initializing = false
async function initMap() {
  if (map || initializing || !mapContainer.value) {
    return
  }

  initializing = true
  let terraDrawModule: any = null
  let adapterModule: any = null
  try {
    // Dynamic: MapLibre touches window at import time, which SSR cannot do.
    mapLib = await import('maplibre-gl')
    ;[terraDrawModule, adapterModule] = await Promise.all([
      import('terra-draw'),
      import('terra-draw-maplibre-gl-adapter'),
    ])
    // Vite does not serve the worker where MapLibre expects it, so point it at
    // the bundled file. Without this every tile fails "Worker failed to load".
    mapLib.setWorkerUrl(mapWorkerUrl)
    map = new mapLib.Map({
      container: mapContainer.value,
      style: mapStyle.value,
      center: mapCenter.value,
      zoom: mapZoom.value,
      attributionControl: { compact: true },
    })
  }
  catch (err) {
    // Display-only, but a failure here must not block editing: report it and
    // carry on with the form still usable.
    useErrorReporter().captureException(err, { context: 'geofence-map-init' })
    map = null
    mapLib = null
  }
  finally {
    initializing = false
  }

  if (!map)
    return

  // Registered before Terra Draw is built. A drawing failure must not cost the
  // tiles, the radius ring, or the jumpTo that follows a fence change. Both
  // events, because setStyle on a theme switch throws away every source and
  // layer added here - including Terra Draw's own. Re-adding on 'load' alone
  // left the geofence invisible after a theme switch until a reload. Both
  // handlers are idempotent.
  map.on('load', onMapReady)
  map.on('style.load', onMapReady)

  try {
    const styles = drawStyles()
    terraDraw = new terraDrawModule.TerraDraw({
      adapter: new adapterModule.TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        // Render mode takes its identity from `modeName` and refuses to build
        // without it - Terra Draw throws "Mode name is required for
        // TerraDrawRenderMode". It is also the key setMode and
        // updateModeOptions look a mode up by.
        new terraDrawModule.TerraDrawRenderMode({ modeName: 'render', styles: styles.render }),
        new terraDrawModule.TerraDrawPolygonMode({
          styles: styles.polygon,
          keyEvents: { cancel: 'Escape', finish: 'Enter' },
          showCoordinatePoints: true,
        }),
        new terraDrawModule.TerraDrawPointMode({ styles: styles.point }),
        new terraDrawModule.TerraDrawSelectMode({ styles: styles.select, flags: drawFlags }),
      ],
    })
    terraDraw.on('change', (changes: any, origin: any) => {
      // Terra Draw emits 'change' with origin 'styling' when paint styles are
      // refreshed; the snapshot itself is untouched, so there is nothing to
      // mirror. That event arrived on load with an empty store and, treated as
      // "no shape", readDrawIntoState cleared the local polygon just before the
      // first real push. Ignore empty/style-only sweeps.
      if (origin === 'styling' || !Array.isArray(changes) || changes.length === 0)
        return
      readDrawIntoState()
    })
  }
  catch (err) {
    useErrorReporter().captureException(err, { context: 'geofence-draw-init' })
    terraDraw = null
    drawStarted = false
  }
}

// A point geofence is stored as a centre plus a radius in metres, which is not
// a shape MapLibre can draw. A 64-segment ring is visually identical at the
// zooms this page reaches and leaves the stored contract untouched. Emits
// [lng, lat] for GeoJSON; storage stays [lat, lng].
function circleRing(lat: number, lng: number, meters: number): [number, number][] {
  const steps = 64
  const earth = 6371000
  const dLat = (meters / earth) * (180 / Math.PI)
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const dLng = ((meters / (earth * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)) * Math.sin(bearing)
    ring.push([lng + dLng, lat + dLat * Math.cos(bearing)])
  }
  return ring
}

function closed(ring: [number, number][]): [number, number][] {
  if (ring.length < 3)
    return ring
  const [firstX, firstY] = ring[0]
  const [lastX, lastY] = ring[ring.length - 1]
  return (firstX === lastX && firstY === lastY) ? ring : [...ring, ring[0]]
}

// Terra Draw renders the shape you trace. The only thing left for our own
// layers is the radius ring of a point geofence: it follows the Radius field,
// so it is derived state rather than something a drawing library can hold.
const drawnFeatures = computed<GeoJSON.Feature[]>(() => {
  if (geofenceType.value !== 'point' || !center.value)
    return []
  const radius = radiusMeters.value ?? 0
  if (radius <= 0)
    return []
  return [{
    type: 'Feature',
    properties: { kind: 'circle' },
    geometry: { type: 'Polygon', coordinates: [closed(circleRing(center.value.lat, center.value.lng, radius))] },
  }]
})

function pushToMap() {
  if (!map || !map.isStyleLoaded())
    return
  const source = map.getSource(SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined
  source?.setData({ type: 'FeatureCollection', features: drawnFeatures.value })
}

// Map paint and source data sit outside Vue's reactivity, so repaint by hand
// whenever anything they read from changes. The radius ring is the only thing
// our own layers draw now; Terra Draw paints the shape.
watch([drawnFeatures, isActive], () => {
  if (!map)
    return
  pushToMap()
  // Every paint value that reads reactive state has to be refreshed here, not
  // only at layer creation: fill-opacity follows isActive, and it was frozen at
  // whatever it held when the layer was created.
  if (map.getLayer(LAYER_FILL)) {
    map.setPaintProperty(LAYER_FILL, 'fill-color', fillColor.value)
    map.setPaintProperty(LAYER_FILL, 'fill-opacity', isActive.value ? 0.18 : 0.1)
  }
  if (map.getLayer(LAYER_LINE))
    map.setPaintProperty(LAYER_LINE, 'line-color', strokeColor.value)
}, { deep: true })

// Terra Draw mode styles are plain values, not reactive, so re-apply them when
// the palette or the active flag changes. A theme switch also restarts the
// adapter, which re-applies them on its own - running this twice is harmless.
watch([colorMode, isActive], () => {
  applyDrawOptions()
})

// Geometry moved outside Terra Draw - loading a fence, switching type, Clear -
// so mirror it back into the store. Synchronous, so the flag that readDrawInto
// State raises still covers this run.
watch([polygon, center], () => {
  pushStateIntoDraw()
}, { deep: true, flush: 'sync' })

watch([mapTool, isReadOnly, geofenceType], () => {
  applyDrawMode()
})

watch([mapCenter, mapZoom], () => {
  map?.jumpTo({ center: mapCenter.value, zoom: mapZoom.value })
})

watch(mapStyle, (style) => {
  map?.setStyle(style)
})

// Watch the element rather than a flag: the container mounts inside <ClientOnly>
// after page setup, so watching a value missed it and left a blank map.
watch(mapContainer, (el) => {
  if (el)
    initMap()
})

// No manual dragPan/scrollZoom gating any more. Terra Draw's adapter calls
// setDraggability(false) itself while you drag a handle, and turning panning
// off used to cost you the ability to pan at all while drawing.

function applyGeofence(fence: any, nextMode: 'view' | 'edit' | 'create') {
  isApplyingConfig.value = true
  selectedId.value = fence?.id ?? null
  name.value = fence?.name || ''
  isActive.value = Boolean(fence?.isActive)
  interactionPolicy.value = fence?.interactionMode === 'allow_with_comment'
    ? 'allow_with_comment'
    : fence?.interactionMode === 'allow'
      ? 'allow'
      : 'disallow'
  geofenceType.value = fence?.type === 'polygon' ? 'polygon' : 'point'
  radiusMeters.value = typeof fence?.radiusMeters === 'number' ? fence.radiusMeters : null
  if (fence?.type === 'point' && typeof fence?.centerLat === 'number' && typeof fence?.centerLng === 'number') {
    center.value = { lat: fence.centerLat, lng: fence.centerLng }
  }
  else {
    center.value = null
  }
  polygon.value = Array.isArray(fence?.polygon) ? fence.polygon : []
  mode.value = nextMode
  nextTick(() => {
    isApplyingConfig.value = false
  })
}

function startCreate() {
  selectedId.value = null
  name.value = ''
  isActive.value = false
  interactionPolicy.value = 'disallow'
  geofenceType.value = 'point'
  radiusMeters.value = 100
  center.value = null
  polygon.value = []
  mapTool.value = 'add'
  mode.value = 'create'
}

function startEdit() {
  if (!selectedId.value)
    return
  mode.value = 'edit'
}

function cancelEdit() {
  if (selectedId.value) {
    const current = geofences.value.find(g => g.id === selectedId.value)
    if (current) {
      applyGeofence(current, 'view')
      return
    }
  }
  mode.value = 'view'
}

// Click-to-place is gone: Terra Draw puts vertices where you click. The old
// onMapDblClick handler never made it across either - it stopped propagation
// and then did nothing - so it stays deleted.

// Terra Draw has no "finish" method. Closing a polygon is a key event that
// goes to the map canvas, so the Finish button raises that key instead of
// reaching into the mode. Clicking the first vertex closes it all the same.
function finishPolygon() {
  if (!map || polygon.value.length < 3)
    return
  map.getCanvas().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
}

function undoVertex() {
  if (!terraDraw || !drawStarted)
    return
  terraDraw.undo()
}

function clearPolygon() {
  polygon.value = []
}

function distanceMeters(a: [number, number], b: [number, number]) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const suggestedRadius = computed(() => {
  if (geofenceType.value === 'point' && center.value) return null
  if (geofenceType.value === 'polygon' && polygon.value.length >= 2) {
    const centroid = mapCenter.value
    const distances = polygon.value.map(p => distanceMeters([centroid[0], centroid[1]], p))
    return Math.max(...distances)
  }
  return null
})

async function saveGeofence() {
  saving.value = true
  try {
    const payload: any = {
      name: name.value,
      isActive: isActive.value,
      interactionMode: interactionPolicy.value,
      type: geofenceType.value,
      radiusMeters: radiusMeters.value,
      centerLat: center.value?.lat ?? null,
      centerLng: center.value?.lng ?? null,
      polygon: polygon.value,
    }
    if (mode.value === 'create') {
      const res: any = await $fetch('/api/admin/geofences', {
        method: 'POST',
        body: payload,
        credentials: 'include',
      })
      toast.add({ title: 'Geofence created', color: 'primary' })
      await refresh()
      if (res?.geofence?.id) {
        const created = geofences.value.find(g => g.id === res.geofence.id)
        if (created)
          applyGeofence(created, 'view')
      }
    }
    else if (selectedId.value) {
      await $fetch(`/api/admin/geofences/${selectedId.value}` as string, {
        method: 'PUT',
        body: payload,
        credentials: 'include',
      })
      toast.add({ title: 'Geofence updated', color: 'primary' })
      await refresh()
      const updated = geofences.value.find(g => g.id === selectedId.value)
      if (updated)
        applyGeofence(updated, 'view')
    }
  }
  catch (err: any) {
    toast.add({ title: 'Failed to save geofence', description: err?.message || 'Unknown error', color: 'danger' })
  }
  finally {
    saving.value = false
  }
}

function confirmDelete(fence: any) {
  deleteTarget.value = fence
  showDelete.value = true
}

async function deleteGeofence() {
  if (!deleteTarget.value)
    return
  saving.value = true
  try {
    await $fetch(`/api/admin/geofences/${deleteTarget.value.id}` as string, {
      method: 'DELETE',
      credentials: 'include',
    })
    toast.add({ title: 'Geofence deleted', color: 'primary' })
    showDelete.value = false
    deleteTarget.value = null
    await refresh()
    const nextFence = geofences.value[0]
    if (nextFence)
      applyGeofence(nextFence, 'view')
    else
      startCreate()
  }
  catch (err: any) {
    toast.add({ title: 'Failed to delete geofence', description: err?.message || 'Unknown error', color: 'danger' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageWrapper>
    <!-- Add moved up from the list card's own header. The page header is the
         single place for page-level actions, matching shifts/users. -->
    <template #navRight>
      <SButton
        color="primary"
        icon="i-heroicons-plus"
        @click="startCreate"
      >
        {{ t('adminGeofence.add') }}
      </SButton>
    </template>

    <div class="grid gap-4 lg:grid-cols-3">
      <SCard class="lg:col-span-1">
        <template #header>
          <div>
            <p class="text-sm font-medium">
              {{ t('adminGeofence.list.title') }}
            </p>
            <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.list.description') }}
            </p>
          </div>
        </template>

        <div :class="{ 'opacity-50 pointer-events-none': isLoading }">
          <p v-if="!geofences.length" class="text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminGeofence.list.empty') }}
          </p>
          <ul v-else class="space-y-2">
            <li v-for="fence in geofences" :key="fence.id">
              <!-- Selection uses the brand ramp from main.css rather than a
                   Selaras token: there is no resolved primary-subtle or
                   primary-border variable to reference outside a component. -->
              <div
                class="flex items-stretch overflow-hidden rounded-md border transition-colors"
                :class="fence.id === selectedId
                  ? 'border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-950'
                  : 'border-[var(--selaras-resolved-border-default)] hover:bg-[var(--selaras-resolved-surface-elevated)]'"
              >
                <SButton
                  variant="ghost"
                  color="neutral"
                  class="h-auto min-w-0 flex-1 p-0"
                  :aria-current="fence.id === selectedId ? 'true' : undefined"
                  @click="applyGeofence(fence, 'view')"
                >
                  <!-- SButton centres its slot by default; the w-full wrapper
                       lays the row out instead of fighting it with a
                       justify-start override, which does not take. -->
                  <span class="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left">
                    <span class="w-full truncate text-sm font-medium">
                      {{ fenceName(fence) }}
                    </span>
                    <span class="flex flex-wrap gap-1">
                      <SBadge size="sm" variant="soft" :color="fence.type === 'polygon' ? 'warning' : 'primary'">
                        {{ fence.type === 'polygon' ? t('adminGeofence.badge.polygon') : t('adminGeofence.badge.point') }}
                      </SBadge>
                      <SBadge size="sm" variant="soft" :color="fence.isActive ? 'primary' : 'neutral'">
                        {{ fence.isActive ? t('adminGeofence.badge.active') : t('adminGeofence.badge.inactive') }}
                      </SBadge>
                      <SBadge size="sm" variant="soft" color="neutral">
                        {{ policyLabel(fence.interactionMode) }}
                      </SBadge>
                    </span>
                  </span>
                </SButton>
                <SDropdown
                  :items="rowMenuItems(fence)"
                  :positioning="{ align: 'end' }"
                >
                  <SButton
                    variant="ghost"
                    color="neutral"
                    class="w-8 shrink-0 self-center"
                    :aria-label="t('adminGeofence.actions.moreLabel', { name: fenceName(fence) })"
                  >
                    <SIcon name="i-lucide-ellipsis-vertical" />
                  </SButton>
                </SDropdown>
              </div>
            </li>
          </ul>
        </div>
      </SCard>

      <SCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">
                {{ mode === 'create'
                  ? t('adminGeofence.detail.newTitle')
                  : mode === 'edit'
                    ? t('adminGeofence.detail.editTitle')
                    : t('adminGeofence.detail.viewTitle') }}
              </p>
              <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminGeofence.detail.description') }}
              </p>
            </div>
            <div class="flex gap-2">
              <SButton
                v-if="mode === 'view' && selectedId"
                size="sm"
                variant="soft"
                @click="startEdit"
              >
                {{ t('adminGeofence.actions.edit') }}
              </SButton>
              <SButton
                v-if="mode !== 'view'"
                size="sm"
                variant="ghost"
                color="neutral"
                @click="cancelEdit"
              >
                {{ t('adminGeofence.actions.cancel') }}
              </SButton>
              <SButton
                v-if="mode !== 'view'"
                size="sm"
                :loading="saving"
                icon="i-heroicons-cloud-arrow-up"
                @click="saveGeofence"
              >
                {{ t('adminGeofence.actions.save') }}
              </SButton>
            </div>
          </div>
        </template>

        <!-- Form 2/5, map 3/5. The map needs the room: drawing a polygon means
             clicking precise vertices, and it was previously sharing the row
             equally with the form. -->
        <div class="grid gap-4 lg:grid-cols-5">
          <div class="space-y-4 lg:col-span-2" :class="{ 'opacity-50 pointer-events-none': isLoading }">
            <SFormField :label="t('adminGeofence.form.name.label')">
              <SInput
                v-model="name"
                :placeholder="t('adminGeofence.form.name.placeholder')"
                :disabled="isReadOnly"
              />
            </SFormField>

            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium">
                  {{ t('adminGeofence.form.active.label') }}
                </p>
                <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
                  {{ t('adminGeofence.form.active.description') }}
                </p>
              </div>
              <ClientOnly>
                <SSwitch v-model="isActive" :loading="pending" :disabled="isReadOnly" />
              </ClientOnly>
            </div>

            <SFormField
              :label="t('adminGeofence.form.policy.label')"
              :description="t('adminGeofence.form.policy.description')"
            >
              <SSelect
                v-model="interactionPolicy"
                :items="policyItems"
                class="w-full"
                label-key="label"
                value-key="value"
                :disabled="isReadOnly"
              />
            </SFormField>

            <div>
              <p class="font-medium mb-1">
                {{ t('adminGeofence.form.type.label') }}
              </p>
              <SRadioGroup
                v-model="geofenceType"
                name="geofence-type"
                :items="geofenceItems"
                :disabled="isReadOnly"
              />
            </div>

            <!-- The map tool and the polygon actions moved out of this form and up to a
                 toolbar above the map. They only affect the map, and sitting
                 between "Geofence type" and "Radius" made them read as another
                 field of the geofence. -->
            <SFormField
              v-if="isRadiusEditable"
              :label="t('adminGeofence.form.radius.label')"
              :description="suggestedRadius
                ? t('adminGeofence.form.radius.suggested', { m: Math.round(suggestedRadius) })
                : undefined"
            >
              <SInput
                v-model.number="radiusMeters"
                type="number"
                min="0"
                :placeholder="t('adminGeofence.form.radius.placeholder')"
                :disabled="isReadOnly"
              />
            </SFormField>
            <p v-else class="text-xs text-[var(--selaras-resolved-text-muted)]">
              {{ t('adminGeofence.form.radius.fixedForPolygon') }}
            </p>
          </div>

          <div class="lg:col-span-3">
            <!-- Map toolbar. Everything here acts on the map, so it sits with
                 the map rather than in the form column. -->
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <SToggleGroup
                v-model="mapTool"
                :items="mapToolItems"
                size="sm"
                :disabled="isReadOnly"
                :aria-label="t('adminGeofence.map.tool.label')"
              />
              <div class="flex flex-wrap items-center gap-2">
                <SBadge size="sm" variant="soft" color="neutral">
                  {{ t('adminGeofence.map.polygon.vertices', { count: polygon.length }) }}
                </SBadge>
                <SButton
                  size="sm"
                  icon="i-heroicons-check"
                  :disabled="polygon.length < 3 || isReadOnly"
                  @click="finishPolygon"
                >
                  {{ t('adminGeofence.map.polygon.finish') }}
                </SButton>
                <SButton
                  size="sm"
                  variant="soft"
                  icon="i-heroicons-arrow-uturn-left"
                  :disabled="!polygon.length || isReadOnly"
                  @click="undoVertex"
                >
                  {{ t('adminGeofence.map.polygon.undo') }}
                </SButton>
                <SButton
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-heroicons-trash"
                  :disabled="!polygon.length || isReadOnly"
                  @click="clearPolygon"
                >
                  {{ t('adminGeofence.map.polygon.clear') }}
                </SButton>
              </div>
            </div>
            <p class="mb-2 text-xs text-[var(--selaras-resolved-text-muted)]">
              <template v-if="mapTool === 'add'">
                {{ geofenceType === 'polygon'
                  ? t('adminGeofence.map.polygon.hint')
                  : t('adminGeofence.map.point.hint') }}
              </template>
              <template v-else-if="center && geofenceType === 'point'">
                {{ t('adminGeofence.map.point.current') }}: {{ center.lat.toFixed(5) }}, {{ center.lng.toFixed(5) }}
              </template>
              <template v-else-if="!center && !polygon.length">
                {{ t('adminGeofence.map.empty') }}
              </template>
            </p>

            <ClientOnly>
              <div
                class="h-[460px] overflow-hidden rounded-lg border border-[var(--selaras-resolved-border-default)] lg:h-[560px]"
                :class="[mapTool === 'add' && !isReadOnly ? '!cursor-crosshair' : '']"
              >
                <!-- The container is the map. Watched by element in initMap,
                     so no :key - the map is built once and moved with jumpTo. -->
                <div
                  ref="mapContainer"
                  class="size-full"
                />
              </div>
              <template #fallback>
                <div class="h-[460px] flex items-center justify-center text-sm text-[var(--selaras-resolved-text-muted)] lg:h-[560px]">
                  {{ t('adminGeofence.map.loading') }}
                </div>
              </template>
            </ClientOnly>
          </div>
        </div>
      </SCard>
    </div>

    <SModal
      v-model:open="showDelete"
      :title="t('adminGeofence.confirm.deleteTitle')"
    >
      <template #body>
        <p class="text-sm text-[var(--selaras-resolved-text-default)]">
          {{ t('adminGeofence.confirm.deleteBody', { name: deleteTarget?.name || t('adminGeofence.list.untitled') }) }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <SButton color="neutral" variant="soft" @click="showDelete = false">
            {{ t('adminGeofence.actions.cancel') }}
          </SButton>
          <SButton
            color="danger"
            icon="i-heroicons-trash"
            :loading="saving"
            @click="deleteGeofence"
          >
            {{ t('adminGeofence.actions.delete') }}
          </SButton>
        </div>
      </template>
    </SModal>
  </PageWrapper>
</template>
