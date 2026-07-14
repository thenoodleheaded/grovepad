import type { FieldCommand, FieldValueType, SemanticUnit } from './fieldConnections'

// ---------------------------------------------------------------------------
// Circuit schema — the persistent wiring layer of the canvas.
//
// A Connection is a directed wire between two widgets' registry fields
// (src/widgets/fields.ts). Two kinds exist:
//
// - 'value'   — a live data wire. Whenever the source field's value changes,
//               the value is passed through the wire's transform and written
//               into the target field. A target field accepts AT MOST ONE
//               incoming value wire (single-writer rule), which keeps
//               propagation deterministic: no last-writer-wins races.
// - 'trigger' — an event wire. The engine watches the source field for the
//               configured edge (rising / falling / any change) and fires a
//               one-shot command on the target widget when it occurs.
//
// Connections are structural board state: they persist, sync, undo, and
// cascade-delete exactly like relations do.
// ---------------------------------------------------------------------------

export type WireKind = 'value' | 'trigger'

/** Which source-field movement fires a trigger wire. */
export type TriggerEdge = 'rising' | 'falling' | 'change'

export const TRIGGER_EDGE_LABELS: Record<TriggerEdge, string> = {
  rising: 'Turns on',
  falling: 'Turns off',
  change: 'Any change',
}

// ---------------------------------------------------------------------------
// Wire transforms — the no-code computation layer that rides on value wires.
// Each is a tiny pure function; anything heavier belongs in a Script Block
// widget wired inline. Params are stored inline so a wire is self-contained.
// ---------------------------------------------------------------------------

export type WireTransform =
  | { op: 'identity' }
  | { op: 'scale'; factor: number }
  | { op: 'offset'; amount: number }
  | { op: 'clamp'; min: number; max: number }
  | { op: 'map_range'; inMin: number; inMax: number; outMin: number; outMax: number }
  | { op: 'round' }
  | { op: 'invert' }
  | { op: 'threshold'; value: number }
  | { op: 'format'; template: string }

export type WireTransformOp = WireTransform['op']

export const WIRE_TRANSFORM_OPS: readonly WireTransformOp[] = [
  'identity',
  'scale',
  'offset',
  'clamp',
  'map_range',
  'round',
  'invert',
  'threshold',
  'format',
]

export const WIRE_TRANSFORM_LABELS: Record<WireTransformOp, string> = {
  identity: 'Pass through',
  scale: 'Multiply',
  offset: 'Add',
  clamp: 'Clamp',
  map_range: 'Map range',
  round: 'Round',
  invert: 'Invert',
  threshold: 'Threshold',
  format: 'Format text',
}

export const WIRE_TRANSFORM_HINTS: Record<WireTransformOp, string> = {
  identity: 'Deliver the value unchanged',
  scale: 'value × factor',
  offset: 'value + amount',
  clamp: 'Keep the value between min and max',
  map_range: 'Re-map one numeric range onto another',
  round: 'Round to the nearest integer',
  invert: 'NOT for booleans, negate for numbers',
  threshold: 'true when value ≥ threshold',
  format: 'Insert the value into a text template ({value})',
}

/**
 * Advisory transform suggested when a value wire connects two fields with
 * differing semantic units. Never blocks a connection — an unmatched pair
 * simply gets no suggestion and the wire defaults to identity, exactly as
 * before. Deliberately conservative: only the handful of conversions with
 * one obviously-correct answer are covered.
 */
export function suggestTransform(
  fromUnit: SemanticUnit | undefined,
  toUnit: SemanticUnit | undefined,
): WireTransform | undefined {
  if (!fromUnit || !toUnit || fromUnit === 'none' || toUnit === 'none' || fromUnit === toUnit) {
    return undefined
  }
  if (fromUnit === 'ratio' && toUnit === 'percent') return { op: 'scale', factor: 100 }
  if (fromUnit === 'percent' && toUnit === 'ratio') return { op: 'scale', factor: 0.01 }
  // A raw count feeding a percent input has no natural scale — clamping is
  // a safety net against a count blowing straight past 100%, not a guess.
  if (fromUnit === 'count' && toUnit === 'percent') return { op: 'clamp', min: 0, max: 100 }
  return undefined
}

/** A fresh parameter set for each transform op — used by the wire inspector. */
export function defaultTransform(op: WireTransformOp): WireTransform {
  switch (op) {
    case 'scale':
      return { op, factor: 2 }
    case 'offset':
      return { op, amount: 1 }
    case 'clamp':
      return { op, min: 0, max: 100 }
    case 'map_range':
      return { op, inMin: 0, inMax: 100, outMin: 0, outMax: 1 }
    case 'threshold':
      return { op, value: 1 }
    case 'format':
      return { op, template: '{value}' }
    case 'round':
    case 'invert':
    case 'identity':
      return { op }
  }
}

// ---------------------------------------------------------------------------
// Connection record
// ---------------------------------------------------------------------------

export interface Connection {
  id: string
  /** Source widget + readable field key from its field registry. */
  fromId: string
  fromField: string
  /** Target widget. */
  toId: string
  kind: WireKind
  /** value wires: the settable target field key. */
  toField?: string
  /** trigger wires: the command to run and the edge that fires it. */
  command?: FieldCommand
  edge?: TriggerEdge
  /** value wires: optional computation applied in transit. */
  transform?: WireTransform
  /** A disabled wire stays on the board but carries nothing. */
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Wire color language — one hue per value flavor, shared by ports, wires,
// and the inspector so the type system is legible at a glance.
// ---------------------------------------------------------------------------

// Hues sit ~60° apart and run brighter than the old palette so the five
// signals stay tellable at a glance on dark glass and at far zoom. They
// deliberately differ in lightness as well as hue — never hue alone — so
// the code stays legible for most color-vision types.
export const VALUE_TYPE_COLORS: Record<FieldValueType, string> = {
  number: '#31a6ff', // vivid azure
  boolean: '#1fe58c', // vivid spring green
  text: '#b46bff', // saturated violet
  series: '#ffab1a', // vivid orange-amber
}

export const TRIGGER_WIRE_COLOR = '#ff5470' // vivid crimson-rose — events, not data

// ---------------------------------------------------------------------------
// Validation — persistence and cloud payloads are untrusted.
// ---------------------------------------------------------------------------

const TRIGGER_EDGES = new Set<string>(['rising', 'falling', 'change'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidTransform(value: unknown): value is WireTransform {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  switch (t.op) {
    case 'identity':
    case 'round':
    case 'invert':
      return true
    case 'scale':
      return isFiniteNumber(t.factor)
    case 'offset':
      return isFiniteNumber(t.amount)
    case 'clamp':
      return isFiniteNumber(t.min) && isFiniteNumber(t.max)
    case 'map_range':
      return (
        isFiniteNumber(t.inMin) &&
        isFiniteNumber(t.inMax) &&
        isFiniteNumber(t.outMin) &&
        isFiniteNumber(t.outMax)
      )
    case 'threshold':
      return isFiniteNumber(t.value)
    case 'format':
      return typeof t.template === 'string' && t.template.length <= 400
    default:
      return false
  }
}

/**
 * Shape-check a raw connection. Field/command existence against the widget
 * registry is the caller's job (it needs the widgets record); this validates
 * the record's own structure.
 */
export function isValidConnectionShape(value: unknown): value is Connection {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  if (
    typeof c.id !== 'string' ||
    typeof c.fromId !== 'string' ||
    typeof c.fromField !== 'string' ||
    typeof c.toId !== 'string' ||
    typeof c.enabled !== 'boolean'
  ) {
    return false
  }
  if (c.kind === 'value') {
    if (typeof c.toField !== 'string') return false
    if (c.transform !== undefined && !isValidTransform(c.transform)) return false
    return true
  }
  if (c.kind === 'trigger') {
    if (typeof c.command !== 'string') return false
    if (typeof c.edge !== 'string' || !TRIGGER_EDGES.has(c.edge)) return false
    return true
  }
  return false
}
