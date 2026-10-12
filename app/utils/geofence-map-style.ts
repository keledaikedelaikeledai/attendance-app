import type { StyleSpecification } from 'maplibre-gl'

export const GEOFENCE_DRAW_PREFIX = 'geofence-draw'

/** Keep application geometry above the new basemap, including unfinished drawings. */
export function preserveGeofenceOverlays(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!previous) return next
  const sources = Object.fromEntries(Object.entries(previous.sources).filter(([id]) =>
    id === 'geofence-selected' || id === 'geofence-all' || id.startsWith(`${GEOFENCE_DRAW_PREFIX}-`),
  ))
  const layers = previous.layers.filter(layer => 'source' in layer && typeof layer.source === 'string' && layer.source in sources)
  const layerIds = new Set(layers.map(layer => layer.id))
  return {
    ...next,
    sources: { ...next.sources, ...sources },
    layers: [...next.layers.filter(layer => !layerIds.has(layer.id)), ...layers],
  }
}
