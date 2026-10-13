import { describe, expect, test } from 'bun:test'
import { distanceToPolygonMeters, evaluateGeofence, haversineMeters, pointInPolygon } from '../../shared/utils/geofence-geo'

const pointFence = {
  id: 'fence-point',
  name: 'Office',
  type: 'point',
  centerLat: -6.264734535237949,
  centerLng: 106.8864069748855,
  radiusMeters: 250,
  interactionMode: 'disallow',
  isActive: true,
}

// Rough square around the point fence center, ~50m per side.
const polygonFence = {
  id: 'fence-poly',
  name: 'Yard',
  type: 'polygon',
  polygon: [
    [-6.2645, 106.8860],
    [-6.2645, 106.8870],
    [-6.2652, 106.8870],
    [-6.2652, 106.8860],
  ],
  interactionMode: 'allow_with_comment',
  isActive: true,
}

const near = { latitude: -6.264734535237949, longitude: 106.8864069748855 } // dead center
const far = { latitude: -6.264734535237949, longitude: 106.8964069748855 } // ~1.1 km east

describe('haversineMeters', () => {
  test('zero distance for the same point', () => {
    expect(haversineMeters([0, 0], [0, 0])).toBe(0)
  })

  test('equator: one degree of longitude is ~111.2 km', () => {
    const d = haversineMeters([0, 0], [0, 1])
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
})

describe('pointInPolygon', () => {
  test('inside, outside and edge behaviour on a square', () => {
    expect(pointInPolygon([-6.2648, 106.8865], polygonFence.polygon!)).toBe(true)
    expect(pointInPolygon([-6.26, 106.8865], polygonFence.polygon!)).toBe(false)
    expect(pointInPolygon([-6.2648, 106.9], polygonFence.polygon!)).toBe(false)
  })
})

describe('distanceToPolygonMeters', () => {
  test('zero inside, positive outside', () => {
    expect(distanceToPolygonMeters([-6.2648, 106.8865], polygonFence.polygon!)).toBe(0)
    const d = distanceToPolygonMeters([-6.26, 106.8865], polygonFence.polygon!)
    expect(d).toBeGreaterThan(400)
    expect(d).toBeLessThan(600)
  })
})

describe('evaluateGeofence', () => {
  test('no fences is open', () => {
    const ev = evaluateGeofence(near.latitude, near.longitude, [])
    expect(ev.allowed).toBe(true)
    expect(ev.fence).toBeNull()
  })

  test('missing coords is open at the shared layer (policy belongs to the server)', () => {
    const ev = evaluateGeofence(undefined, undefined, [pointFence])
    expect(ev.allowed).toBe(true)
    expect(ev.fence).toBeNull()
  })

  test('inside a disallow point fence is allowed', () => {
    const ev = evaluateGeofence(near.latitude, near.longitude, [pointFence])
    expect(ev.allowed).toBe(true)
    expect(ev.requireComment).toBe(false)
    expect(ev.fence?.id).toBe('fence-point')
    expect(ev.inside).toBe(true)
  })

  test('outside a disallow point fence is blocked, with matched distance', () => {
    const ev = evaluateGeofence(far.latitude, far.longitude, [pointFence])
    expect(ev.allowed).toBe(false)
    expect(ev.requireComment).toBe(false)
    expect(ev.dist).toBeGreaterThan(1000)
  })

  test('allow_with_comment outside asks for a comment', () => {
    const ev = evaluateGeofence(far.latitude, far.longitude, [polygonFence])
    expect(ev.allowed).toBe(true)
    expect(ev.requireComment).toBe(true)
    expect(ev.fence?.id).toBe('fence-poly')
  })

  test('allow mode records the fence without blocking', () => {
    const ev = evaluateGeofence(far.latitude, far.longitude, [{ ...pointFence, interactionMode: 'allow' }])
    expect(ev.allowed).toBe(true)
    expect(ev.requireComment).toBe(false)
    expect(ev.fence?.id).toBe('fence-point')
  })

  test('inactive fences do not constrain', () => {
    const ev = evaluateGeofence(far.latitude, far.longitude, [{ ...pointFence, isActive: false }])
    expect(ev.allowed).toBe(true)
    expect(ev.fence).toBeNull()
  })

  test('closest active fence wins when several apply', () => {
    // A tiny allow fence centered on the point itself, plus a disallow
    // fence a degree away that the point is outside of. The closest one
    // (dist 0) must govern the decision.
    const tinyNear = { ...pointFence, id: 'fence-tiny', radiusMeters: 10, interactionMode: 'allow' as const }
    const farDisallow = { ...pointFence, id: 'fence-far', centerLat: near.latitude + 0.01 }
    const ev = evaluateGeofence(near.latitude, near.longitude, [farDisallow, tinyNear])
    expect(ev.fence?.id).toBe('fence-tiny')
    expect(ev.allowed).toBe(true)
  })
})
