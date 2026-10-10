import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// Everything about the map itself: the MapLibre instance, the layers, the
// OpenFreeMap style swap, the Terra Draw wiring and the two-way mirror between
// the drawing store and plain Vue state.
//
// One map instance serves both browsing and editing on the single geofence
// page. `editing` flips it between a read-only render of the selected fence and
// a live drawing surface. Terra Draw is always present so the same store and
// layers paint the shape in both states - there is deliberately no second map
// inside the form, which is what made the old slideover attempt unworkable.

export interface GeofenceShape {
  id: string
  name?: string
  type?: 'point' | 'polygon'
  isActive?: boolean
  radiusMeters?: number
  centerLat?: number | null
  centerLng?: number | null
  polygon?: Array<[number, number]> | null
}

export type GeofenceTool = 'select' | 'point' | 'polygon'

export interface UseGeofenceMapOptions {
  /** True while the edit panel is open; false renders the fence read-only. */
  editing: Ref<boolean>
  geofences: Ref<GeofenceShape[]>
  selectedId: Ref<string | null>
  isActive: Ref<boolean>
  mapContainer: Ref<HTMLElement | null>
  /**
   * Called on the map's first load, after the layers exist. Fires again on every
   * style.load, so a caller that only wants the first one has to guard itself.
   */
  onReady?: () => void
}

const SOURCE_ID = 'geofence-selected'
const LAYER_FILL = 'geofence-selected-fill'
const LAYER_LINE = 'geofence-selected-line'

const ALL_SOURCE_ID = 'geofence-all'
const ALL_FILL = 'geofence-all-fill'
const ALL_LINE = 'geofence-all-line'
const ALL_POINT = 'geofence-all-point'

// Terra Draw validates feature ids as UUIDs (length 36) and silently drops
// anything else, which used to leave the store empty with no error.
const SHAPE_ID = '00000000-0000-4000-8000-000000000000'

// Guidance handles Terra Draw parks in the store beside your geometry.
const GUIDANCE_PROPS = [
  'closingPoint',
  'snappingPoint',
  'coordinatePoint',
  'midPoint',
  'selectionPoint',
  'edited',
  'marker',
]

const defaultCenter: [number, number] = [-6.2, 106.816666]

// Basemaps offered on the geofence map. OpenFreeMap is the vector default and
// the only source that follows the light/dark theme; the raster sources are
// there for how much more they put on the map (street names, POIs, buildings,
// imagery) when the minimal vector style is too bare to place a fence against.
export type GeofenceTileSource = 'openfreemap' | 'osm' | 'streets' | 'satellite'

// A minimal MapLibre raster style around one tile set. `maxzoom` is where the
// source stops; MapLibre overzooms past it, so deep zooms stay painted instead
// of going blank. There are no symbol layers in this app's geofence styling, so
// the style needs no `glyphs` URL.
function rasterStyle(tiles: string[], attribution: string, maxzoom: number) {
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  }
}

export function useGeofenceMap(options: UseGeofenceMapOptions) {
  const { editing, geofences, selectedId, isActive, mapContainer } = options

  const colorMode = useColorMode()

  // Shape state. The page reads these to render the form; Terra Draw writes them
  // while drawing and reads them when the shape moves outside the store.
  const geofenceType = ref<'point' | 'polygon'>('point')
  const radiusMeters = ref<number | null>(100)
  const center = ref<{ lat: number, lng: number } | null>(null)
  const polygon = ref<Array<[number, number]>>([])

  // The single interaction model. `select` manipulates an existing shape;
  // `point` and `polygon` both arm a draw mode AND set the geofence type, so the
  // tool on the map and the type in the form can never disagree.
  const tool = ref<GeofenceTool>('select')

  // Kept across visits with useState so the basemap a user picks survives
  // browsing away and back, instead of snapping to the default each time.
  const tileSource = useState<GeofenceTileSource>('geofence-tile-source', () => 'openfreemap')

  const mapStyle = computed<any>(() => {
    switch (tileSource.value) {
      case 'osm':
        return rasterStyle(
          ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          '© OpenStreetMap contributors',
          19,
        )
      case 'streets':
        // Esri World Street Map: detailed street cartography, no API key, and
        // the same ArcGIS host and `{z}/{y}/{x}` order as the satellite source.
        // It replaces Carto Voyager, whose basemap expects an API key.
        return rasterStyle([
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        ], 'Powered by Esri — Source: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community', 19)
      case 'satellite':
        // ArcGIS World Imagery orders the path `{z}/{y}/{x}`, not `{z}/{x}/{y}`.
        return rasterStyle([
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ], 'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', 19)
      default:
        // Only the vector source reads the colour mode, so a theme switch does
        // not needlessly reload a raster basemap.
        return colorMode.value === 'dark'
          ? 'https://tiles.openfreemap.org/styles/fiord'
          : 'https://tiles.openfreemap.org/styles/positron'
    }
  })

  const fillColor = computed(() => colorMode.value === 'dark' ? '#60a5fa' : '#2563eb')
  // Grey is the browse-time treatment for an inactive fence. While the editor is
  // open, the shape is the thing being worked on and grey reads as disabled -
  // the dot a fresh point click places was grey for exactly that reason, since
  // new fences start inactive. Accent colour in both states instead.
  const strokeColor = computed(() => (isActive.value || editing.value) ? fillColor.value : '#9ca3af')

  let mapLib: any = null
  let map: any = null
  let terraDraw: any = null
  let drawStarted = false
  // Set while we write the store. Terra Draw fires `change` synchronously from
  // inside clear() and addFeatures().
  let writingDraw = false
  // Set while we write Vue state from Terra Draw. The state watcher uses
  // `flush: 'sync'`, so it still runs under this flag; the flag is dropped on
  // nextTick, after that flush.
  let suppressPush = false
  // Set while the radius handle is being dragged, so the reposition watcher does
  // not fight the pointer.
  let draggingRadius = false
  let radiusMarker: any = null
  let radiusMarkerEl: HTMLElement | null = null
  // Set by an explicit Finish so the mode-switch watcher does not raise a second
  // synthetic Enter at a polygon that was already committed.
  let justFinished = false

  // ---------------------------------------------------------------------------
  // Geometry helpers. Emits [lng, lat] for GeoJSON; storage stays [lat, lng].
  // ---------------------------------------------------------------------------

  // A point geofence is a centre plus a radius in metres, which is not a shape
  // MapLibre can draw. A 64-segment ring is visually identical at the zooms this
  // reaches and leaves the stored contract untouched.
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

  // The east edge of a point fence's ring - where the draggable radius handle
  // sits so a circle can be sized by eye instead of by typing a number.
  function ringEdge(lat: number, lng: number, meters: number): [number, number] {
    const earth = 6371000
    const dLng = (meters / (earth * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)
    return [lng + dLng, lat]
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

  // Normalize a ring to the closed form GeoJSON requires (first point repeated
  // at the end). Callers hand us both forms - stored polygons come back open,
  // circleRing already emits closed - and the output must always be closed:
  // MapLibre's line bucket segments vertices pairwise and has no closure pass of
  // its own, so it relies on the closing vertex being there. Stripping it (what
  // this used to do for already-closed input) cost the outline its seam
  // segment: a visibly cut circle.
  function closed(ring: [number, number][]): [number, number][] {
    if (ring.length < 3)
      return ring
    const [firstX, firstY] = ring[0]
    const [lastX, lastY] = ring[ring.length - 1]
    if (firstX === lastX && firstY === lastY)
      return ring
    return [...ring, [firstX, firstY]]
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

  // ---------------------------------------------------------------------------
  // What to draw.
  // ---------------------------------------------------------------------------

  // Only the radius ring lives here. Terra Draw is always present now, so it
  // paints the centre dot and the polygon itself in every mode (render included);
  // drawing those again from our own layers would double them up. The ring is
  // derived state a drawing library cannot hold, so it stays ours.
  const selectedFeatures = computed<GeoJSON.Feature[]>(() => {
    if (geofenceType.value !== 'point' || !center.value)
      return []
    const radius = radiusMeters.value ?? 0
    if (radius <= 0)
      return []
    return [{
      type: 'Feature',
      properties: { kind: 'ring' },
      geometry: { type: 'Polygon', coordinates: [closed(circleRing(center.value.lat, center.value.lng, radius))] },
    }]
  })

  // Every fence at once, as a muted underlay, excluding the selected one.
  // Hidden entirely while the edit panel is open: with everyone else's rings and
  // polygons on screen it is hard to tell which shape is the one being edited or
  // drawn, and a stray click can no longer land on the wrong fence anyway
  // (underlay clicks are already suppressed while editing).
  const allFeatures = computed<GeoJSON.Feature[]>(() => {
    if (editing.value)
      return []
    const feats: GeoJSON.Feature[] = []
    for (const f of geofences.value ?? []) {
      if (!f || f.id === selectedId.value)
        continue
      if (f.type === 'polygon' && Array.isArray(f.polygon) && f.polygon.length >= 3) {
        feats.push({
          type: 'Feature',
          properties: { kind: 'polygon', id: f.id },
          geometry: { type: 'Polygon', coordinates: [closed(f.polygon.map(([lat, lng]) => [lng, lat]))] },
        })
      }
      else if (f.type === 'point' && typeof f.centerLat === 'number' && typeof f.centerLng === 'number') {
        const r = typeof f.radiusMeters === 'number' ? f.radiusMeters : 0
        if (r > 0) {
          feats.push({
            type: 'Feature',
            properties: { kind: 'ring', id: f.id },
            geometry: { type: 'Polygon', coordinates: [closed(circleRing(f.centerLat, f.centerLng, r))] },
          })
        }
        feats.push({
          type: 'Feature',
          properties: { kind: 'point', id: f.id },
          geometry: { type: 'Point', coordinates: [f.centerLng, f.centerLat] },
        })
      }
    }
    return feats
  })

  const mapCenter = computed<[number, number]>(() => {
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

  // A radius big enough to cover the drawn polygon, offered as a starting point
  // when a polygon is converted to a point fence.
  const suggestedRadius = computed<number | null>(() => {
    if (geofenceType.value !== 'polygon' || polygon.value.length < 2)
      return null
    const [lng, lat] = mapCenter.value
    const distances = polygon.value.map(([plat, plng]) => distanceMeters([lat, lng], [plat, plng]))
    return Math.max(...distances)
  })

  // ---------------------------------------------------------------------------
  // Layers.
  // ---------------------------------------------------------------------------

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
        paint: { 'line-color': strokeColor.value, 'line-width': 2 },
      })
    }
    if (!m.getSource(ALL_SOURCE_ID))
      m.addSource(ALL_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    if (!m.getLayer(ALL_FILL)) {
      m.addLayer({
        id: ALL_FILL,
        type: 'fill',
        source: ALL_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': fillColor.value, 'fill-opacity': 0.07 },
      })
    }
    if (!m.getLayer(ALL_LINE)) {
      m.addLayer({
        id: ALL_LINE,
        type: 'line',
        source: ALL_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': fillColor.value, 'line-width': 1.5, 'line-opacity': 0.6 },
      })
    }
    if (!m.getLayer(ALL_POINT)) {
      m.addLayer({
        id: ALL_POINT,
        type: 'circle',
        source: ALL_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': fillColor.value, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
      })
    }
    pushSelectedToMap()
    pushAllToMap()
  }

  // Do not gate these on `isStyleLoaded()`. With the OpenFreeMap vector styles
  // it is still false well after first paint, so an early return fired every
  // time: the sources were created and never filled. The underlay showed nothing
  // when zoomed out, and a theme switch re-added the layers and then refused to
  // fill them again. `setData` only needs the source to exist.
  function pushSelectedToMap() {
    const source = map?.getSource(SOURCE_ID) as any
    source?.setData({ type: 'FeatureCollection', features: selectedFeatures.value })
  }

  function pushAllToMap() {
    const source = map?.getSource(ALL_SOURCE_ID) as any
    source?.setData({ type: 'FeatureCollection', features: allFeatures.value })
  }

  // ---------------------------------------------------------------------------
  // The radius handle. A draggable MapLibre marker on the ring's east edge.
  // ---------------------------------------------------------------------------

  function ensureRadiusMarker() {
    const should = Boolean(map)
      && editing.value
      && geofenceType.value === 'point'
      && Boolean(center.value)
      && (radiusMeters.value ?? 0) > 0

    if (!should) {
      if (radiusMarker) {
        radiusMarker.remove()
        radiusMarker = null
        radiusMarkerEl = null
      }
      return
    }

    if (!radiusMarker && mapLib && map) {
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.background = '#ffffff'
      el.style.border = `2px solid ${fillColor.value}`
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
      el.style.cursor = 'ew-resize'
      radiusMarkerEl = el
      radiusMarker = new mapLib.Marker({ element: el, draggable: true, anchor: 'center' })
      radiusMarker.on('drag', () => {
        if (!center.value)
          return
        draggingRadius = true
        const ll = radiusMarker.getLngLat()
        radiusMeters.value = Math.max(1, Math.round(distanceMeters([center.value.lat, center.value.lng], [ll.lat, ll.lng])))
      })
      radiusMarker.on('dragend', () => {
        draggingRadius = false
      })
      // Give the marker a position before attaching it. MapLibre's addTo runs a
      // position update of its own, and that update dereferences the marker's
      // lngLat unchecked. A marker attached without one throws inside addTo -
      // aborting the render that follows the click - and then throws again from
      // every map move event afterwards, because the marker listens to those.
      if (center.value)
        radiusMarker.setLngLat(ringEdge(center.value.lat, center.value.lng, radiusMeters.value ?? 0))
      radiusMarker.addTo(map)
    }

    if (radiusMarker && center.value && !draggingRadius)
      radiusMarker.setLngLat(ringEdge(center.value.lat, center.value.lng, radiusMeters.value ?? 0))
  }

  // ---------------------------------------------------------------------------
  // Terra Draw.
  // ---------------------------------------------------------------------------

  const drawMode = computed<string>(() => {
    if (!editing.value)
      return 'render'
    if (tool.value === 'point')
      return 'point'
    if (tool.value === 'polygon')
      return 'polygon'
    return 'select'
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
    if (radiusMarkerEl)
      radiusMarkerEl.style.border = `2px solid ${fillColor.value}`
  }

  // The two branches differ on purpose. For a polygon, geometry type alone is
  // enough - every handle is a Point - and property tests are unsafe, because
  // the polygon itself carries `coordinatePointIds`, a pointer to its own
  // handles. Filtering on that rejected the real shape, so the mirror read
  // "nothing here" and the next push cleared the store. The point branch has to
  // test properties, since its shape is a Point like the handles; `mode` stays
  // 'point' on the real feature even when it is selected.
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
    const features = shapeFeatures(terraDraw.getSnapshot())
    suppressPush = true
    if (geofenceType.value === 'point') {
      // Point mode appends a feature on every click, so a click meant to move
      // the pin used to leave the old dot behind - and this mirror kept the
      // FIRST feature, so the centre never moved and strays piled up. A point
      // fence has exactly one point: the newest click wins, older dots are
      // deleted from the store here.
      if (features.length > 1) {
        const stale = features.slice(0, -1).map((f: any) => f.id).filter(Boolean)
        if (stale.length) {
          writingDraw = true
          try {
            terraDraw.removeFeatures(stale)
          }
          finally {
            writingDraw = false
          }
        }
      }
      const feature = features[features.length - 1]
      const coordinates = feature?.geometry?.coordinates
      center.value = coordinates ? { lat: coordinates[1], lng: coordinates[0] } : null
      // A click just placed the pin. Hand the pointer back to Select so the
      // point is immediately draggable instead of being replaced by the next
      // click - the single biggest friction in the old flow.
      if (center.value && tool.value === 'point')
        enterSelect()
    }
    else if (features[0]) {
      polygon.value = openRing(features[0].geometry.coordinates[0])
        .map(([lng, lat]) => [lat, lng] as [number, number])
    }
    else {
      polygon.value = []
    }
    nextTick(() => {
      suppressPush = false
    })
  }

  // Terra Draw has no "finish" method. Closing a polygon is a key event that
  // goes to the map canvas, so the Finish button raises that key instead of
  // reaching into the mode. Clicking the first vertex closes it all the same.
  function finishPolygon() {
    if (!map || polygon.value.length < 3)
      return
    justFinished = true
    map.getCanvas().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    enterSelect()
  }

  // Drop the pointer back to Select and, once the mode has actually switched,
  // select the shape so its vertex / drag handles appear without a second click.
  function enterSelect() {
    tool.value = 'select'
    nextTick(() => {
      if (!terraDraw || !drawStarted || terraDraw.getMode() !== 'select')
        return
      // Select the feature the store actually holds. A fence loaded from the
      // server keeps SHAPE_ID, but one drawn here (a fresh point click, a
      // just-finished polygon) keeps Terra Draw's generated id - selecting the
      // bare SHAPE_ID missed those, and select mode only drags the selected
      // feature, so a freshly placed pin could not be moved until it had been
      // clicked a second time.
      const [shape] = shapeFeatures(terraDraw.getSnapshot())
      if (!shape?.id)
        return
      try {
        terraDraw.selectFeature(shape.id)
      }
      catch {
        // Selecting is a convenience; a failure must not break the draw.
      }
    })
  }

  // Arm a draw tool. Choosing Point or Polygon is both the interaction and the
  // geofence type, so the two can never disagree; it also clears the geometry of
  // the other kind, matching what the old type radio did.
  function setTool(next: GeofenceTool) {
    if (next === 'point') {
      geofenceType.value = 'point'
      polygon.value = []
    }
    else if (next === 'polygon') {
      geofenceType.value = 'polygon'
      center.value = null
      polygon.value = []
    }
    tool.value = next
  }

  function applyDrawMode() {
    if (!terraDraw || !drawStarted)
      return
    const next = drawMode.value
    if (justFinished) {
      // The polygon was already committed by an explicit Finish; do not raise a
      // second Enter at it. Consume the flag either way.
      justFinished = false
    }
    else if (terraDraw.getMode() === 'polygon' && next !== 'polygon') {
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
    // key event, and the change it causes must not be read back as a shape.
    applyDrawOptions()
    suppressPush = false
    pushStateIntoDraw()
    ensureRadiusMarker()
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

  // ---------------------------------------------------------------------------
  // Init and lifecycle.
  // ---------------------------------------------------------------------------

  // Both events: 'load' covers the first paint, 'style.load' covers the theme
  // switch that tears the adapter down again.
  function onMapReady() {
    addGeofenceLayers()
    restartDraw()
    ensureRadiusMarker()
    options.onReady?.()
  }

  let initializing = false
  async function initMap() {
    if (map || initializing || !mapContainer.value)
      return

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
      // Vite does not serve the worker where MapLibre expects it, so point it
      // at the bundled file. Without this every tile fails "Worker failed to
      // load". Must happen before the Map is constructed: the map spawns its
      // worker immediately, so setting it afterwards leaves a blank canvas.
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

  // Watch the element rather than a flag: the container mounts inside
  // <ClientOnly> after page setup, so watching a value missed it and left a
  // blank map.
  watch(mapContainer, (el) => {
    if (el)
      initMap()
  })

  // Map paint and source data sit outside Vue's reactivity, so repaint by hand
  // whenever anything they read from changes. `editing` is in the list because
  // the stroke colour follows it (accent while the editor is open).
  watch([selectedFeatures, isActive, editing], () => {
    if (!map)
      return
    pushSelectedToMap()
    if (map.getLayer(LAYER_FILL)) {
      map.setPaintProperty(LAYER_FILL, 'fill-color', fillColor.value)
      map.setPaintProperty(LAYER_FILL, 'fill-opacity', isActive.value ? 0.18 : 0.1)
    }
    if (map.getLayer(LAYER_LINE))
      map.setPaintProperty(LAYER_LINE, 'line-color', strokeColor.value)
  }, { deep: true })

  watch([allFeatures, isActive], () => {
    if (!map)
      return
    pushAllToMap()
  }, { deep: true })

  // Geometry moved outside Terra Draw - loading a fence, switching type, Clear -
  // so mirror it back into the store.
  watch([polygon, center], () => {
    pushStateIntoDraw()
  }, { deep: true, flush: 'sync' })

  // Mode styles are plain values, not reactive, so re-apply them when the
  // palette or the active flag changes.
  watch([colorMode, isActive], () => {
    applyDrawOptions()
  })

  watch([tool, geofenceType, editing], () => {
    applyDrawMode()
  })

  watch([mapCenter, mapZoom], () => {
    map?.jumpTo({ center: mapCenter.value, zoom: mapZoom.value })
  })

  watch(mapStyle, (style) => {
    map?.setStyle(style)
  })

  // Keep the handle glued to the ring edge as the radius or centre changes,
  // except while the pointer is the thing moving it.
  watch([editing, geofenceType, center, radiusMeters], () => {
    ensureRadiusMarker()
  })

  // Frame the shape. Polygons use their bounds rather than a centroid, and a
  // point uses a bounds derived from its radius, because a centroid at a fixed
  // zoom leaves long thin polygons and small radii off screen.
  function flyToShape(options: { padding?: number, maxZoom?: number, duration?: number } = {}) {
    const m = map
    if (!m || !mapLib)
      return
    const { padding = 90, maxZoom = 18, duration = 900 } = options
    const bounds = new mapLib.LngLatBounds()

    if (geofenceType.value === 'polygon' && polygon.value.length >= 3) {
      for (const [lat, lng] of polygon.value)
        bounds.extend([lng, lat])
    }
    else if (geofenceType.value === 'point' && center.value) {
      // 111320 m per degree of latitude; longitude shrinks with the cosine, so a
      // radius near the poles would otherwise be framed far too tightly.
      const r = Math.max(radiusMeters.value ?? 0, 150)
      const dLat = r / 111320
      const dLng = r / (111320 * Math.cos(center.value.lat * Math.PI / 180) || 1)
      bounds.extend([center.value.lng - dLng, center.value.lat - dLat])
      bounds.extend([center.value.lng + dLng, center.value.lat + dLat])
    }
    else {
      return
    }

    m.fitBounds(bounds, { padding, maxZoom, duration })
  }

  // A point and its radius ring are two features, so a click can land on either.
  // Both carry the fence id, so the first hit resolves either way.
  function fenceIdAt(point: any): string | null {
    if (!map)
      return null
    const hits = map.queryRenderedFeatures(point, { layers: [ALL_FILL, ALL_LINE, ALL_POINT] })
    for (const hit of hits) {
      const id = hit.properties?.id
      if (typeof id === 'string' && id)
        return id
    }
    return null
  }

  function onUnderlayClick(e: any, onPick: (id: string) => void) {
    // While editing, every click belongs to Terra Draw or to the shape being
    // worked on; never steal it to re-select from the list underneath.
    if (editing.value)
      return
    const id = fenceIdAt(e.point)
    if (id)
      onPick(id)
  }

  function onUnderlayHover(e: any) {
    if (!map)
      return
    if (editing.value) {
      map.getCanvas().style.cursor = ''
      return
    }
    const over = !!fenceIdAt(e.point)
    map.getCanvas().style.cursor = over ? 'pointer' : ''
  }

  function bindMapEvents(onPick: (id: string) => void) {
    map?.on('click', (e: any) => onUnderlayClick(e, onPick))
    map?.on('mousemove', onUnderlayHover)
  }

  // MapLibre caches the canvas size. A container that changes width (a panel
  // opening, a sidebar collapsing, a resize) needs this or it renders letterboxed.
  function resize() {
    map?.resize()
  }

  function clearPolygon() {
    polygon.value = []
  }

  function undoVertex() {
    if (!terraDraw || !drawStarted)
      return
    terraDraw.undo()
  }

  return {
    // state
    geofenceType,
    radiusMeters,
    center,
    polygon,
    tool,
    // basemap
    tileSource,
    // derived
    mapCenter,
    mapZoom,
    suggestedRadius,
    // actions
    setTool,
    enterSelect,
    flyToShape,
    bindMapEvents,
    resize,
    finishPolygon,
    clearPolygon,
    undoVertex,
  }
}
