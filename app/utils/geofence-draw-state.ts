/** Draw/selection handles are also Points, but are never saved geofence geometry. */
export function geofenceShapeFeatures(snapshot: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const guidance = ['closingPoint', 'snappingPoint', 'coordinatePoint', 'midPoint', 'selectionPoint', 'edited', 'marker']
  return snapshot.filter((feature) => {
    if (feature.geometry.type === 'Polygon') return true
    if (feature.geometry.type !== 'Point') return false
    const properties = feature.properties ?? {}
    return properties.mode !== 'select' && !guidance.some(key => properties[key])
  })
}
