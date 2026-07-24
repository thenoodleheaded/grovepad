/**
 * The single source of truth for the in-app UI fine-tuning menu (opened with G).
 *
 * Every knob is one `TuneField`: a numeric slider bound to one CSS custom
 * property. Changing a value writes that property onto `:root` so the whole app
 * updates live; a value left at its default writes nothing, so the stylesheet's
 * own value stays authoritative and a fresh install leaves no trace on the DOM.
 *
 * Adding a new knob is deliberately one edit here plus one `var(--gp-tune-…, …)`
 * in the stylesheet — the panel renders whatever this catalogue contains.
 */

type TuneUnit = 'px' | 'ms' | '%' | ''

export interface TuneField {
  /** Stable storage key — never rename once shipped, it is persisted. */
  id: string
  label: string
  /** The CSS custom property this knob writes to `:root`. */
  cssVar: string
  min: number
  max: number
  step: number
  /** The value at which the app looks exactly as it does with no tuning at all.
   * MUST equal the fallback baked into the stylesheet's `var(--…, fallback)`. */
  default: number
  unit: TuneUnit
  /** One short line shown under the control when a consequence isn't obvious. */
  help?: string
}

export interface TuneCategory {
  id: string
  label: string
  fields: TuneField[]
}

/**
 * The catalogue. Grouped into the visual systems an owner actually reaches for.
 * Each field's `default` is mirrored as the fallback in the stylesheet, so these
 * numbers and the CSS must move together.
 */
export const TUNE_CATEGORIES: TuneCategory[] = [
  {
    id: 'expanded',
    label: 'Expanded card',
    fields: [
      {
        id: 'haloBlur',
        label: 'Background blur',
        cssVar: '--gp-tune-halo-blur',
        min: 0,
        max: 40,
        step: 1,
        default: 13,
        unit: 'px',
        help: 'How strongly the frosted floor blurs what sits behind the open card.',
      },
      {
        id: 'haloSpread',
        label: 'Blur spread',
        cssVar: '--gp-tune-halo-spread',
        min: 40,
        max: 320,
        step: 8,
        default: 120,
        unit: 'px',
        help: 'How far past the card edge the blur reaches (120 = three grid cells).',
      },
      {
        id: 'haloSoftness',
        label: 'Edge softness',
        cssVar: '--gp-tune-halo-softness',
        min: 0,
        max: 95,
        step: 5,
        default: 55,
        unit: '%',
        help: 'Lower feathers earlier (softer, cloudier); higher holds the blur solid to the rim.',
      },
      {
        id: 'haloDim',
        label: 'Background dim',
        cssVar: '--gp-tune-halo-dim',
        min: 0,
        max: 0.8,
        step: 0.02,
        default: 0.3,
        unit: '',
        help: 'How much the floor darkens the neighbours underneath it.',
      },
      {
        id: 'expandShadow',
        label: 'Lift shadow',
        cssVar: '--gp-tune-expand-shadow',
        min: 0,
        max: 0.85,
        step: 0.02,
        default: 0.58,
        unit: '',
        help: 'Depth of the drop shadow that makes the open card feel raised.',
      },
    ],
  },
  {
    id: 'cards',
    label: 'Widget cards',
    fields: [
      {
        id: 'cardShadow',
        label: 'Resting shadow',
        cssVar: '--gp-tune-card-shadow',
        min: 0,
        max: 0.7,
        step: 0.02,
        default: 0.32,
        unit: '',
        help: 'Shadow depth of every card sitting at rest on the board.',
      },
      {
        id: 'cardRadius',
        label: 'Corner radius',
        cssVar: '--gp-tune-card-radius',
        min: 6,
        max: 40,
        step: 1,
        default: 22,
        unit: 'px',
        help: 'How rounded every card’s corners are.',
      },
      {
        id: 'cardBorder',
        label: 'Edge highlight',
        cssVar: '--gp-tune-card-border',
        min: 0,
        max: 30,
        step: 0.5,
        default: 8.5,
        unit: '%',
        help: 'Brightness of the hairline outline around each card.',
      },
      {
        id: 'islandLight',
        label: 'Island lift',
        cssVar: '--gp-tune-island-light',
        min: 0,
        max: 24,
        step: 1,
        default: 10,
        unit: '%',
        help: 'How much a raised island (a content group inside a card) catches the light.',
      },
    ],
  },
  {
    id: 'selection',
    label: 'Selection',
    fields: [
      {
        id: 'selectRing',
        label: 'Highlight ring',
        cssVar: '--gp-tune-select-ring',
        min: 1,
        max: 6,
        step: 0.5,
        default: 3,
        unit: 'px',
        help: 'Thickness of the accent ring around a selected card.',
      },
    ],
  },
  {
    id: 'motion',
    label: 'Motion',
    fields: [
      {
        id: 'motionLayout',
        label: 'Layout movement',
        cssVar: '--gp-motion-layout',
        min: 80,
        max: 800,
        step: 20,
        default: 300,
        unit: 'ms',
        help: 'How long cards take to glide, settle, expand and collapse.',
      },
      {
        id: 'motionReveal',
        label: 'Reveal',
        cssVar: '--gp-motion-reveal',
        min: 80,
        max: 600,
        step: 20,
        default: 260,
        unit: 'ms',
        help: 'Pace of panels and lists appearing.',
      },
      {
        id: 'motionSnap',
        label: 'Feedback speed',
        cssVar: '--gp-tune-snap',
        min: 40,
        max: 400,
        step: 10,
        default: 150,
        unit: 'ms',
        help: 'How quick small hover and press responses feel across the app.',
      },
    ],
  },
  {
    id: 'structure',
    label: 'Lines & outlines',
    fields: [
      {
        id: 'relationWidth',
        label: 'Connector width',
        cssVar: '--gp-relation-outline-width',
        min: 1,
        max: 5,
        step: 0.5,
        default: 2,
        unit: 'px',
        help: 'Line weight of parent/relation outlines between cards.',
      },
      {
        id: 'gridOpacity',
        label: 'Grid visibility',
        cssVar: '--gp-tune-grid',
        min: 0,
        max: 3,
        step: 0.1,
        default: 1,
        unit: '',
        help: 'How strongly the canvas grid dots show. 0 hides the grid entirely.',
      },
    ],
  },
]

/** Flat id → field lookup, built once from the catalogue. */
export const TUNE_FIELDS: Record<string, TuneField> = Object.fromEntries(
  TUNE_CATEGORIES.flatMap((c) => c.fields).map((f) => [f.id, f]),
)

export type TuningValues = Record<string, number>

function clampField(field: TuneField, value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(Math.max(value, field.min), field.max)
}

/**
 * Validates unknown data (restored localStorage) into a values map. Unknown keys
 * are dropped, out-of-range numbers are clamped, and values that equal their
 * default are omitted so storage only ever holds genuine overrides.
 */
export function sanitizeTuningValues(raw: unknown): TuningValues {
  const source = (raw ?? {}) as Record<string, unknown>
  const next: TuningValues = {}
  for (const field of Object.values(TUNE_FIELDS)) {
    const clamped = clampField(field, source[field.id])
    if (clamped === null || clamped === field.default) continue
    next[field.id] = clamped
  }
  return next
}

/** The value a field is actually at right now — the override, or its default. */
export function effectiveTuneValue(field: TuneField, values: TuningValues): number {
  const clamped = clampField(field, values[field.id])
  return clamped ?? field.default
}

/** Renders a field's numeric value into the string its CSS property expects. */
export function formatTuneValue(field: TuneField, value: number): string {
  return `${value}${field.unit}`
}

/**
 * Pushes the overridden knobs onto `:root` as inline custom properties, and
 * removes any knob sitting at its default so the stylesheet's own value resumes.
 * Idempotent: safe to call on every change and on first load. A no-op without a
 * DOM (guards against non-browser evaluation).
 */
export function applyUiTuning(values: TuningValues): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const field of Object.values(TUNE_FIELDS)) {
    const value = effectiveTuneValue(field, values)
    if (value === field.default) {
      root.style.removeProperty(field.cssVar)
    } else {
      root.style.setProperty(field.cssVar, formatTuneValue(field, value))
    }
  }
}
