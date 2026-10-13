import type { StyleSpecification, TransformStyleFunction } from 'maplibre-gl'

// OpenFreeMap's styles (positron, fiord) compare raw feature properties with
// numeric operators, e.g. ["<=", ["get", "ref_length"], 6]. Road features
// without that property evaluate the comparison against null, and MapLibre
// logs a warning per feature per tile ("Expected value to be of type number,
// but found null instead. Falling back to false") before discarding the
// feature anyway. The verdict never changes - null always compared false -
// so the console noise is bought with nothing.
//
// Sanitizing rewrites each numeric comparison against a property lookup into
// a null-safe one: ["<=", ["get", "ref_length"], 6] becomes
// ["<=", ["coalesce", ["get", "ref_length"], 7], 6] - the sentinel is chosen
// per operator to compare false, exactly what null did before, silently.

const NUMERIC_COMPARISONS = new Set(['<', '<=', '>', '>='])

function isPropertyLookup(node: unknown): node is ['get', string] {
  return Array.isArray(node) && node[0] === 'get' && typeof node[1] === 'string'
}

// The sentinel must make the comparison return false for the null case, the
// same verdict MapLibre's fallback produced.
function nullSentinel(op: string, propertyFirst: boolean, rhs: number): number {
  if (propertyFirst) {
    // ["<", ["get", k], n]  -> n < n is false
    // ["<=", ["get", k], n] -> (n + 1) <= n is false
    // [">", ["get", k], n]  -> n > n is false
    // [">=", ["get", k], n] -> (n - 1) >= n is false
    return op === '<=' ? rhs + 1 : op === '>=' ? rhs - 1 : rhs
  }
  // ["<", n, ["get", k]]  -> n < n is false
  // ["<=", n, ["get", k]] -> n <= (n - 1) is false
  // [">", n, ["get", k]]  -> n > n is false
  // [">=", n, ["get", k]] -> n >= (n + 1) is false
  return op === '<=' ? rhs - 1 : op === '>=' ? rhs + 1 : rhs
}

function nullSafeFilterNode(node: unknown): unknown {
  if (!Array.isArray(node))
    return node
  if (node.length === 3) {
    const [op, left, right] = node
    if (typeof op === 'string' && NUMERIC_COMPARISONS.has(op)) {
      if (isPropertyLookup(left) && typeof right === 'number' && Number.isFinite(right))
        return [op, ['coalesce', left, nullSentinel(op, true, right)], right]
      if (typeof left === 'number' && Number.isFinite(left) && isPropertyLookup(right))
        return [op, left, ['coalesce', right, nullSentinel(op, false, left)]]
    }
  }
  return node.map(nullSafeFilterNode)
}

/** Rewrite every layer filter's null-fragile numeric comparisons in place-free. */
export function sanitizeMapStyle<T extends StyleSpecification>(style: T): T {
  if (!style || !Array.isArray(style.layers))
    return style
  return {
    ...style,
    layers: style.layers.map(layer => 'filter' in layer
      ? { ...layer, filter: nullSafeFilterNode(layer.filter) }
      : layer),
  } as T
}

/** Map option-free `transformStyle` handler: sanitize whatever the map fetched. */
export const sanitizedMapStyleTransform: TransformStyleFunction = (_previous, next) => sanitizeMapStyle(next)
