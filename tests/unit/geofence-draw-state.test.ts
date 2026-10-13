import { describe, expect, test } from 'bun:test'
import { geofenceShapeFeatures } from '../../app/utils/geofence-draw-state'

describe('geofence drawing geometry', () => {
  const polygon: GeoJSON.Feature = {
    type: 'Feature',
    properties: { mode: 'polygon', coordinatePointIds: ['vertex-1'] },
    geometry: { type: 'Polygon', coordinates: [[[106, -6], [107, -6], [107, -7], [106, -6]]] },
  }
  const point: GeoJSON.Feature = {
    type: 'Feature',
    properties: { mode: 'point', selected: true },
    geometry: { type: 'Point', coordinates: [106, -6] },
  }

  test('detects both geometry types so conversion cannot hide an old shape', () => {
    expect(geofenceShapeFeatures([polygon])).toEqual([polygon])
    expect(geofenceShapeFeatures([point])).toEqual([point])
    expect(geofenceShapeFeatures([polygon, point])).toEqual([polygon, point])
  })

  test('keeps selected geometry while excluding drawing and selection handles', () => {
    const handles: GeoJSON.Feature[] = ['coordinatePoint', 'closingPoint', 'midPoint', 'selectionPoint', 'snappingPoint'].map(key => ({
      ...point,
      properties: { mode: 'polygon', [key]: true },
    }))
    handles.push({ ...point, properties: { mode: 'select' } })
    expect(geofenceShapeFeatures([polygon, point, ...handles])).toEqual([polygon, point])
  })
})
