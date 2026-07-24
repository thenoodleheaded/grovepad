import type { Theme } from '../../store/useThemeStore'

/**
 * Every knob the ambient aura reads, per theme. This module is the single source
 * of truth: the renderer never hard-codes a number, and the dev tuning panel edits
 * exactly this shape. Baking a fine-tuned look into the app therefore means
 * replacing `DEFAULT_AURA_TUNING` below with an exported block — nothing else.
 */
export interface AuraThemeTuning {
  /** Overall opacity multiplier for every blob. */
  alpha: number
  /**
   * Opacity at the exact centre of a blob. Kept below `midAlpha` so the light
   * reads as a soft pool rather than a hotspot directly on top of the widget.
   */
  coreAlpha: number
  /** Where the brightest ring sits, as a fraction of the blob radius. */
  midStop: number
  /** Opacity at `midStop` — the peak of the falloff. */
  midAlpha: number
  /** Blob radius as a multiple of the widget's largest edge. */
  reach: number
  /**
   * Extra radius past `reach`, as a fraction of it, over which the light thins
   * out to nothing. Higher values scatter the glow further from its widget.
   */
  scatter: number
  /** Gaussian blur applied to the low-resolution buffer, in buffer pixels. */
  blur: number
  /** Radius floor/ceiling as a fraction of the buffer, so one widget cannot wash out the board. */
  minRadius: number
  maxRadius: number
  /** How many on-screen widgets may emit at once. */
  maxEmitters: number
  /** `lighter` adds overlapping accents like real light; `source-over` overpaints. */
  blend: 'lighter' | 'source-over'
  /** How long a widget must hold still before its glow re-anchors, in ms. */
  settleMs: number
  /** Per-frame easing applied once settled — lower glides more slowly. */
  glide: number
}

export interface AuraTuning {
  dark: AuraThemeTuning
  light: AuraThemeTuning
}

/** Canvas colours that sit behind the glow. Applied live as CSS custom properties. */
export interface CanvasColorTuning {
  canvasTintBase: string
  gridCoarse: string
  gridFine: string
}

export interface AuraTuningDocument {
  aura: AuraTuning
  canvas: { dark: CanvasColorTuning; light: CanvasColorTuning }
  /** Per-widget-type accent overrides, keyed by widget type then theme. */
  accents: Record<string, { dark?: string; light?: string }>
}

export const DEFAULT_AURA_TUNING: AuraTuning = {
  dark: {
    alpha: 0.1,
    coreAlpha: 0.35,
    midStop: 0.42,
    midAlpha: 0.85,
    reach: 1.15,
    scatter: 0.35,
    blur: 6,
    minRadius: 0.1,
    maxRadius: 0.55,
    maxEmitters: 8,
    blend: 'lighter',
    settleMs: 220,
    glide: 0.06,
  },
  light: {
    // Light mode overpaints through `multiply` rather than adding, so it needs a
    // higher alpha than dark to land at a comparable strength.
    alpha: 0.45,
    coreAlpha: 0.35,
    midStop: 0.42,
    midAlpha: 0.85,
    reach: 1.15,
    scatter: 0.35,
    blur: 6,
    minRadius: 0.1,
    maxRadius: 0.55,
    maxEmitters: 8,
    blend: 'source-over',
    settleMs: 220,
    glide: 0.06,
  },
}

const DEFAULT_CANVAS_COLORS: { dark: CanvasColorTuning; light: CanvasColorTuning } = {
  dark: {
    canvasTintBase: '#141815',
    gridCoarse: 'rgb(137 165 148 / 0.075)',
    gridFine: 'rgb(163 230 53 / 0.13)',
  },
  light: {
    canvasTintBase: '#eef1ec',
    gridCoarse: 'rgb(90 110 98 / 0.09)',
    gridFine: 'rgb(120 160 40 / 0.14)',
  },
}

export const DEFAULT_AURA_DOCUMENT: AuraTuningDocument = {
  aura: DEFAULT_AURA_TUNING,
  canvas: DEFAULT_CANVAS_COLORS,
  accents: {},
}

/** Bounds every numeric knob, so a pasted or hand-edited document can never
 * produce a non-finite radius (which throws out of `createRadialGradient`). */
type AuraNumericKey = {
  [K in keyof AuraThemeTuning]: AuraThemeTuning[K] extends number ? K : never
}[keyof AuraThemeTuning]

const NUMERIC_BOUNDS: Record<AuraNumericKey, [number, number]> = {
  alpha: [0, 1],
  coreAlpha: [0, 1],
  midStop: [0.01, 0.99],
  midAlpha: [0, 1],
  reach: [0.1, 8],
  scatter: [0, 4],
  blur: [0, 40],
  minRadius: [0.01, 1],
  maxRadius: [0.02, 2],
  maxEmitters: [1, 40],
  settleMs: [0, 5000],
  glide: [0.005, 1],
}

export const AURA_NUMERIC_KEYS = Object.keys(NUMERIC_BOUNDS) as AuraNumericKey[]

export function auraNumericBounds(key: AuraNumericKey): [number, number] {
  return NUMERIC_BOUNDS[key]
}

function clampNumber(key: AuraNumericKey, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const [min, max] = auraNumericBounds(key)
  return Math.min(Math.max(value, min), max)
}

function sanitizeTheme(raw: unknown, fallback: AuraThemeTuning): AuraThemeTuning {
  const source = (raw ?? {}) as Partial<AuraThemeTuning>
  const next = { ...fallback }
  for (const key of AURA_NUMERIC_KEYS) {
    next[key] = clampNumber(key, source[key], fallback[key])
  }
  next.blend = source.blend === 'lighter' || source.blend === 'source-over' ? source.blend : fallback.blend
  // A radius floor above the ceiling would invert the clamp and pin every blob
  // to a single size, so the floor always yields.
  if (next.minRadius > next.maxRadius) next.minRadius = next.maxRadius
  return next
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function sanitizeCanvas(raw: unknown, fallback: CanvasColorTuning): CanvasColorTuning {
  const source = (raw ?? {}) as Partial<CanvasColorTuning>
  return {
    canvasTintBase: sanitizeColor(source.canvasTintBase, fallback.canvasTintBase),
    gridCoarse: sanitizeColor(source.gridCoarse, fallback.gridCoarse),
    gridFine: sanitizeColor(source.gridFine, fallback.gridFine),
  }
}

/** Validates unknown data (pasted JSON, restored localStorage) into a usable document. */
export function sanitizeAuraDocument(raw: unknown): AuraTuningDocument {
  const source = (raw ?? {}) as Partial<AuraTuningDocument>
  const accents: AuraTuningDocument['accents'] = {}
  if (source.accents && typeof source.accents === 'object') {
    for (const [type, entry] of Object.entries(source.accents)) {
      if (!entry || typeof entry !== 'object') continue
      const dark = (entry as { dark?: unknown }).dark
      const light = (entry as { light?: unknown }).light
      const next: { dark?: string; light?: string } = {}
      if (typeof dark === 'string' && dark.trim()) next.dark = dark.trim()
      if (typeof light === 'string' && light.trim()) next.light = light.trim()
      if (next.dark || next.light) accents[type] = next
    }
  }
  return {
    aura: {
      dark: sanitizeTheme(source.aura?.dark, DEFAULT_AURA_TUNING.dark),
      light: sanitizeTheme(source.aura?.light, DEFAULT_AURA_TUNING.light),
    },
    canvas: {
      dark: sanitizeCanvas(source.canvas?.dark, DEFAULT_CANVAS_COLORS.dark),
      light: sanitizeCanvas(source.canvas?.light, DEFAULT_CANVAS_COLORS.light),
    },
    accents,
  }
}

/** The subset of a light source the anchor step reads and writes. */
export interface AnchorState {
  anchorX: number
  anchorY: number
  targetX: number
  targetY: number
  targetChangedAt: number
}

/**
 * Moves a light's anchor one frame toward the widget it belongs to.
 *
 * The anchor deliberately lags: while a widget is being dragged its target keeps
 * changing, so `targetChangedAt` keeps resetting and the settle window never
 * elapses — the light stays put instead of smearing across the board. Once the
 * widget rests for `settleMs` the anchor glides over. Returns true when it moved,
 * so the caller knows another frame is needed.
 */
export function advanceAnchor(
  blob: AnchorState,
  now: number,
  settleMs: number,
  glide: number,
  reducedMotion: boolean,
): boolean {
  const dx = blob.targetX - blob.anchorX
  const dy = blob.targetY - blob.anchorY
  if (dx === 0 && dy === 0) return false
  if (reducedMotion) {
    blob.anchorX = blob.targetX
    blob.anchorY = blob.targetY
    return true
  }
  if (settleMs > 0 && now - blob.targetChangedAt < settleMs) return false
  // Snap the last sub-pixel rather than easing forever on a value that can never
  // reach zero by repeated multiplication.
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    blob.anchorX = blob.targetX
    blob.anchorY = blob.targetY
  } else {
    blob.anchorX += dx * glide
    blob.anchorY += dy * glide
  }
  return true
}

/** CSS custom property each canvas colour drives. */
const CANVAS_COLOR_VARS: Record<keyof CanvasColorTuning, string> = {
  canvasTintBase: '--gp-canvas-tint-base',
  gridCoarse: '--gp-grid-coarse',
  gridFine: '--gp-grid-fine',
}

/**
 * Pushes the tuned canvas colours onto the document as inline custom properties,
 * and removes them again on teardown so the stylesheet's own values resume. Only
 * values that actually differ from the defaults are written, so a fresh document
 * leaves no trace on the DOM at all.
 */
export function applyCanvasColors(theme: Theme, colors: CanvasColorTuning): () => void {
  const root = document.documentElement
  const defaults = DEFAULT_CANVAS_COLORS[theme]
  const written: string[] = []
  for (const key of Object.keys(CANVAS_COLOR_VARS) as Array<keyof CanvasColorTuning>) {
    const cssVar = CANVAS_COLOR_VARS[key]
    if (colors[key] === defaults[key]) {
      root.style.removeProperty(cssVar)
      continue
    }
    root.style.setProperty(cssVar, colors[key])
    written.push(cssVar)
  }
  return () => {
    for (const cssVar of written) root.style.removeProperty(cssVar)
  }
}

/** The accent a widget type emits under a theme, falling back to the registry value. */
export function resolveAccent(
  doc: AuraTuningDocument,
  theme: Theme,
  type: string,
  registryAccent: string,
): string {
  return doc.accents[type]?.[theme] ?? registryAccent
}
