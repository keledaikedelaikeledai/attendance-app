import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// Everything about the map itself: the MapLibre instance, the layers, the
// OpenFreeMap style swap, and - only when `editable` - the Terra Draw wiring
// and the two-way mirror between the drawing store and plain Vue state.
//
// Extracted from the geofence page so the overview and the editor can share it.
// The overview passes `editable: false` and gets no drawing library at all,
// which is the point: a read-only page should not ship a drawing engine.

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

export interface UseGeofenceMapOptions {
  /** Set false for the read-only overview: no Terra Draw, no vertex handles. */
  editable?: boolean
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
const SELECTED_POINT = 'geofence-selected-point'

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

export function useGeofenceMap(options: UseGeofenceMapOptions) {
  const editable = options.editable ?? true
  const { geofences, selectedId, isActive, mapContainer } = options

  const colorMode = useColorMode()

  // Shape state. The overview reads these to render the selected fence; the
  // editor writes them from the form and from Terra Draw.
  const geofenceType = ref<'point' | 'polygon'>('point')
  const radiusMeters = ref<number | null>(100)
  const center = ref<{ lat: number, lng: number } | null>(null)
  const polygon = ref<Array<[number, number]>>([])
  const mapTool = ref<'move' | 'add'>('move')

  const mapStyle = computed(() => colorMode.value === 'dark'
    ? 'https://tiles.openfreemap.org/styles/fiord'
    : 'https://tiles.openfreemap.org/styles/positron')

  const fillColor = computed(() => colorMode.value === 'dark' ? '#60a5fa' : '#2563eb')
  const strokeColor = computed(() => isActive.value ? fillColor.value : '#9ca3af')

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

  function closed(ring: [number, number][]): [number, number][] {
    if (ring.length < 3)
      return ring
    const [firstX, firstY] = ring[0]
    const [lastX, lastY] = ring[ring.length - 1]
    if (firstX === lastX && firstY === lastY)
      return ring.slice(0, -1)
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

  function parseMinutes(hhmm: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
  }

  // ---------------------------------------------------------------------------
  // What to draw.
  // ---------------------------------------------------------------------------

  // The shape the selected fence describes, drawn by our own layers. On the
  // editable page Terra Draw paints the shape you are working on and this only
  // supplies the radius ring, which follows the Radius field and is therefore
  // derived state a drawing library cannot hold. On the read-only overview this
  // is the whole selected shape.
  const selectedFeatures = computed<GeoJSON.Feature[]>(() => {
    const feats: GeoJSON.Feature[] = []
    if (geofenceType.value === 'point') {
      if (!center.value)
        return feats
      const radius = radiusMeters.value ?? 0
      if (radius > 0) {
        feats.push({
          type: 'Feature',
          properties: { kind: 'ring' },
          geometry: { type: 'Polygon', coordinates: [closed(circleRing(center.value.lat, center.value.lng, radius))] },
        })
      }
      if (!editable) {
        feats.push({
          type: 'Feature',
          properties: { kind: 'centre' },
          geometry: { type: 'Point', coordinates: [center.value.lng, center.value.lat] },
        })
      }
      return feats
    }
    if (polygon.value.length < 3)
      return feats
    if (editable)
      return feats
    feats.push({
      type: 'Feature',
      properties: { kind: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [closed(polygon.value.map(([lat, lng]) => [lng, lat]))] },
    })
    return feats
  })

  // Every fence at once, as a muted underlay, excluding the selected one.
  const allFeatures = computed<GeoJSON.Feature[]>(() => {
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
    // The centre dot of a point fence. Only drawn when Terra Draw is not, since
    // that paints its own point.
    if (!editable && !m.getLayer(SELECTED_POINT)) {
      m.addLayer({
        id: SELECTED_POINT,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': strokeColor.value,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
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
  // Terra Draw. Only when editable.
  // ---------------------------------------------------------------------------

  const drawMode = computed<string>(() => {
    if (!editable)
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

  // Terra Draw has no "finish" method. Closing a polygon is a key event that
  // goes to the map canvas, so the Finish button raises that key instead of
  // reaching into the mode. Clicking the first vertex closes it all the same.
  function finishPolygon() {
    if (!map || polygon.value.length < 3)
      return
    map.getCanvas().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
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
    // key event, and the change it causes must not be read back as a shape.
    applyDrawOptions()
    suppressPush = false
    pushStateIntoDraw()
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
    if (editable)
      restartDraw()
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
      if (editable) {
        ;[terraDrawModule, adapterModule] = await Promise.all([
          import('terra-draw'),
          import('terra-draw-maplibre-gl-adapter'),
        ])
      }
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

    if (editable) {
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
  }

  // Watch the element rather than a flag: the container mounts inside
  // <ClientOnly> after page setup, so watching a value missed it and left a
  // blank map.
  watch(mapContainer, (el) => {
    if (el)
      initMap()
  })

  // Map paint and source data sit outside Vue's reactivity, so repaint by hand
  // whenever anything they read from changes.
  watch([selectedFeatures, isActive], () => {
    if (!map)
      return
    pushSelectedToMap()
    if (map.getLayer(LAYER_FILL)) {
      map.setPaintProperty(LAYER_FILL, 'fill-color', fillColor.value)
      map.setPaintProperty(LAYER_FILL, 'fill-opacity', isActive.value ? 0.18 : 0.1)
    }
    if (map.getLayer(LAYER_LINE))
      map.setPaintProperty(LAYER_LINE, 'line-color', strokeColor.value)
    if (map.getLayer(SELECTED_POINT))
      map.setPaintProperty(SELECTED_POINT, 'circle-color', strokeColor.value)
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

  watch([mapTool, geofenceType], () => {
    applyDrawMode()
  })

  watch([mapCenter, mapZoom], () => {
    map?.jumpTo({ center: mapCenter.value, zoom: mapZoom.value })
  })

  watch(mapStyle, (style) => {
    map?.setStyle(style)
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
    // While the shape is being drawn the click belongs to Terra Draw, so do not
    // steal it and re-select whatever happens to be under the cursor.
    if (editable && (mapTool.value === 'add' || terraDraw?.getMode() !== 'render'))
      return
    const id = fenceIdAt(e.point)
    if (id)
      onPick(id)
  }

  function onUnderlayHover(e: any) {
    if (!map)
      return
    const drawing = editable && (mapTool.value === 'add' || terraDraw?.getMode() !== 'render')
    const over = !drawing && !!fenceIdAt(e.point)
    map.getCanvas().style.cursor = over ? 'pointer' : (editable && mapTool.value === 'add' ? 'crosshair' : '')
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
    mapTool,
    // map
    mapContainer,
    mapCenter,
    mapZoom,
    // actions
    flyToShape,
    bindMapEvents,
    resize,
    finishPolygon,
    clearPolygon,
    undoVertex,
    parseMinutes,
  }
}
