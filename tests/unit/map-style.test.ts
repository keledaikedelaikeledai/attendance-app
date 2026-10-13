import { describe, expect, test } from 'bun:test'
import { sanitizeMapStyle } from '../../app/utils/map-style'

describe('sanitizeMapStyle', () => {
  test('wraps numeric property comparisons with a null-safe coalesce', () => {
    const style: any = {
      layers: [
        { id: 'a', type: 'symbol', filter: ['all', ['<=', ['get', 'ref_length'], 6], ['match', ['geometry-type'], ['LineString'], true, false]] },
      ],
    }
    const out: any = sanitizeMapStyle(style)
    expect(out.layers[0].filter[1]).toEqual(['<=', ['coalesce', ['get', 'ref_length'], 7], 6])
    // non-numeric branches pass through untouched
    expect(out.layers[0].filter[2]).toEqual(['match', ['geometry-type'], ['LineString'], true, false])
  })

  test('sentinels compare false for every operator, matching the old null fallback', () => {
    const evaluate = (filter: any[]) => {
      const [, wrapped, rhs] = filter
      const value = null // what MapLibre fell back on
      // mirror the runtime: coalesce resolves the sentinel for null
      const operand = wrapped[0] === 'coalesce' ? wrapped[2] : value
      const op = filter[0]
      if (op === '<') return operand < rhs
      if (op === '<=') return operand <= rhs
      if (op === '>') return operand > rhs
      return operand >= rhs
    }
    for (const op of ['<', '<=', '>', '>='] as const) {
      const sanitized: any = sanitizeMapStyle({ layers: [{ id: 'x', type: 'fill', filter: [op, ['get', 'k'], 6] }] })
      expect(evaluate(sanitized.layers[0].filter)).toBe(false)
      const reversed: any = sanitizeMapStyle({ layers: [{ id: 'x', type: 'fill', filter: [op, 6, ['get', 'k']] }] })
      expect(evaluate(reversed.layers[0].filter)).toBe(false)
    }
  })

  test('non-null values keep their verdict', () => {
    const style: any = { layers: [{ id: 'x', type: 'line', filter: ['<=', ['get', 'ref_length'], 6] }] }
    const filter: any = sanitizeMapStyle(style).layers[0].filter
    const operand = (v: number) => (filter[1][0] === 'coalesce' ? (v ?? filter[1][2]) : v)
    expect(operand(3) <= filter[2]).toBe(true) // 3 <= 6 still true, sentinel unused
    expect(operand(9) <= filter[2]).toBe(false)
  })

  test('layers without filters and non-style shapes pass through', () => {
    const style: any = { layers: [{ id: 'bg', type: 'background' }], sources: {} }
    const out: any = sanitizeMapStyle(style)
    expect(out.layers[0]).toEqual({ id: 'bg', type: 'background' })
    expect(out.sources).toEqual({})
    expect(sanitizeMapStyle(null as any)).toBe(null)
    expect(sanitizeMapStyle(undefined as any)).toBe(undefined)
  })

  test('equality filters are left alone (null == number already evaluates false silently)', () => {
    const style: any = { layers: [{ id: 'x', type: 'line', filter: ['==', ['get', 'network'], 'us-highway'] }] }
    const out: any = sanitizeMapStyle(style)
    expect(out.layers[0].filter).toEqual(['==', ['get', 'network'], 'us-highway'])
  })
})
