import type { FieldValue } from '../widgets/contracts/fields'
import type { WireTransform } from '../types/circuit'

// ---------------------------------------------------------------------------
// Wire transforms — pure, total functions over field values.
//
// A transform never throws and never returns NaN/Infinity: a wire must be
// unable to poison the widget it feeds. Coercion mirrors the tolerant
// readers in src/widgets/fields.ts so the two layers agree on meaning.
// ---------------------------------------------------------------------------

function toNumber(value: FieldValue): number {
  if (Array.isArray(value)) return value.at(-1)?.v ?? 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'boolean') return value ? 1 : 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toText(value: FieldValue): string {
  if (Array.isArray(value)) return value.map((point) => point.v).join(', ')
  return typeof value === 'string' ? value : String(value)
}

function toBool(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value >= 1
  return value === 'true' || value === '1' || value === 'yes' || value === 'on'
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** Apply a wire transform. `undefined`/identity passes the value through. */
export function applyTransform(value: FieldValue, transform?: WireTransform): FieldValue {
  if (!transform) return value
  switch (transform.op) {
    case 'identity':
      return value
    case 'scale':
      return finite(toNumber(value) * transform.factor)
    case 'offset':
      return finite(toNumber(value) + transform.amount)
    case 'clamp': {
      const lo = Math.min(transform.min, transform.max)
      const hi = Math.max(transform.min, transform.max)
      return Math.min(hi, Math.max(lo, toNumber(value)))
    }
    case 'map_range': {
      const span = transform.inMax - transform.inMin
      if (span === 0) return finite(transform.outMin)
      const t = (toNumber(value) - transform.inMin) / span
      return finite(transform.outMin + t * (transform.outMax - transform.outMin))
    }
    case 'round':
      return Math.round(toNumber(value))
    case 'invert':
      return typeof value === 'boolean' ? !value : finite(-toNumber(value))
    case 'threshold':
      return toNumber(value) >= transform.value
    case 'format':
      return transform.template.replaceAll('{value}', toText(value))
  }
}

/**
 * Stable serialization for change detection. Field values are primitives or
 * small series arrays, so this stays cheap; the engine compares these strings
 * to decide whether a wire has anything new to say.
 */
export function serializeFieldValue(value: FieldValue): string {
  if (Array.isArray(value)) {
    let out = 's:'
    for (const point of value) out += `${point.t},${point.v};`
    return out
  }
  if (typeof value === 'number') return `n:${value}`
  if (typeof value === 'boolean') return `b:${value}`
  return `t:${value}`
}

/** The boolean reading of a field value — trigger edges are detected on this. */
export function fieldValueAsBool(value: FieldValue): boolean {
  return toBool(value)
}
