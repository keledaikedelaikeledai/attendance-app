import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, test } from 'bun:test'
import { preserveGeofenceOverlays } from '../../app/utils/geofence-map-style'

describe('geofence basemap swaps', () => {
  const next: StyleSpecification = {
    version: 8,
    sources: { basemap: { type: 'raster', tiles: ['https://example.test/{z}/{x}/{y}.png'] } },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  }

  test('retains selected, underlay, and unfinished drawing data above the new basemap', () => {
    const draft = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: { currentlyDrawing: true, mode: 'polygon' },
        geometry: { type: 'Point' as const, coordinates: [106.8, -6.2] },
      }],
    }
    const previous: StyleSpecification = {
      version: 8,
      sources: {
        'oldBasemap': { type: 'raster', tiles: ['https://old.test/{z}/{x}/{y}.png'] },
        'geofence-selected': { type: 'geojson', data: draft },
        'geofence-all': { type: 'geojson', data: draft },
        'geofence-draw-point': { type: 'geojson', data: draft },
      },
      layers: [
        { id: 'oldBasemap', type: 'raster', source: 'oldBasemap' },
        { id: 'selected', type: 'fill', source: 'geofence-selected' },
        { id: 'underlay', type: 'fill', source: 'geofence-all' },
        { id: 'drawing', type: 'circle', source: 'geofence-draw-point' },
      ],
    }
    const result = preserveGeofenceOverlays(previous, next)
    expect(Object.keys(result.sources)).toEqual(['basemap', 'geofence-selected', 'geofence-all', 'geofence-draw-point'])
    expect(result.sources['geofence-draw-point']).toEqual({ type: 'geojson', data: draft })
    expect(result.layers.map(layer => layer.id)).toEqual(['basemap', 'selected', 'underlay', 'drawing'])
    expect(Object.keys(next.sources)).toEqual(['basemap'])
    expect(previous.layers[0].id).toBe('oldBasemap')
    expect(preserveGeofenceOverlays(result, next)).toEqual(result)
  })

  test('accepts an initial style without previous overlays', () => {
    expect(preserveGeofenceOverlays(undefined, next)).toBe(next)
  })
})
