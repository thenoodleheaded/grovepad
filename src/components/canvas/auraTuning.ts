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
  /** Opacity at the exact centre of a blob. */
  coreAlpha: number
  /** How strongly the visible widget footprint contributes to halo depth. */
  reach: number
  /** Extra soft spread beyond the size-derived halo. */
  scatter: number
  /** Gaussian blur applied to the aspect-correct buffer, in buffer pixels. */
  blur: number
  /** Halo floor/ceiling as a fraction of the viewport's shorter edge. */
  minRadius: number
  maxRadius: number
  /** How many on-screen widgets may emit at once. */
  maxEmitters: number
  /** `lighter` adds overlapping accents like real light; `source-over` overpaints. */
  blend: 'lighter' | 'source-over'
}

export interface AuraTuning {
  dark: AuraThemeTuning
  light: AuraThemeTuning
}

/** Canvas colours that sit behind the glow. Applied live as CSS custom properties. */
export interface CanvasColorTuning {
  canvasTintBase: string
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
    alpha: 0.3,
    coreAlpha: 0.78,
    reach: 0.82,
    scatter: 0.22,
    blur: 6,
    minRadius: 0.05,
    maxRadius: 0.18,
    maxEmitters: 16,
    blend: 'lighter',
  },
  light: {
    alpha: 0.34,
    coreAlpha: 0.62,
    reach: 0.78,
    scatter: 0.2,
    blur: 6,
    minRadius: 0.045,
    maxRadius: 0.16,
    maxEmitters: 16,
    blend: 'source-over',
  },
}

const DEFAULT_CANVAS_COLORS: { dark: CanvasColorTuning; light: CanvasColorTuning } = {
  dark: {
    canvasTintBase: '#141815',
    gridFine: 'rgb(163 230 53 / 0.13)',
  },
  light: {
    canvasTintBase: '#eef1ec',
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
  reach: [0, 3],
  scatter: [0, 1.5],
  blur: [0, 24],
  minRadius: [0.01, 0.3],
  maxRadius: [0.02, 0.5],
  maxEmitters: [1, 40],
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

/** CSS custom property each canvas colour drives. */
const CANVAS_COLOR_VARS: Record<keyof CanvasColorTuning, string> = {
  canvasTintBase: '--gp-canvas-tint-base',
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

export interface AuraScreenPool {
  /** Soft extension beyond every side of the visible widget, in CSS pixels. */
  halo: number
  /** Full elliptical pool radii, including half the widget footprint. */
  radiusX: number
  radiusY: number
}

/**
 * Screen-space pool geometry for one visible widget.
 *
 * The halo has a viewport-relative floor, then grows only mildly with the
 * widget's apparent area. Zooming therefore changes the card footprint without
 * turning its light into either a hard speck or a board-wide wash.
 */
export function auraScreenPool(
  width: number,
  height: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  tuning: Pick<AuraThemeTuning, 'reach' | 'scatter' | 'minRadius' | 'maxRadius'>,
): AuraScreenPool {
  if (
    !(width >= 0) ||
    !(height >= 0) ||
    !(zoom > 0) ||
    !(viewportWidth > 0) ||
    !(viewportHeight > 0)
  ) {
    return { halo: 0, radiusX: 0, radiusY: 0 }
  }
  const screenWidth = width * zoom
  const screenHeight = height * zoom
  const viewportEdge = Math.min(viewportWidth, viewportHeight)
  const minHalo = viewportEdge * tuning.minRadius
  const maxHalo = viewportEdge * tuning.maxRadius
  const apparentEdge = Math.sqrt(screenWidth * screenHeight)
  // A fourth-root area response keeps zoom influence gentle: the visible card
  // can grow substantially while the soft light around it changes only mildly.
  const sizeContribution = Math.sqrt(apparentEdge) * 4 * tuning.reach
  const candidate = (minHalo + sizeContribution) * (1 + tuning.scatter)
  const halo = Math.min(Math.max(candidate, minHalo), maxHalo)
  return {
    halo,
    radiusX: screenWidth / 2 + halo,
    radiusY: screenHeight / 2 + halo,
  }
}

/** Aspect-correct low-resolution buffer: enough pixels for a smooth gradient
 * without painting a full viewport-sized canvas on every camera frame. */
export function auraBufferSize(
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { width: 0, height: 0 }
  const scale = Math.min(0.65, 560 / Math.max(viewportWidth, viewportHeight))
  return {
    width: Math.max(1, Math.round(viewportWidth * scale)),
    height: Math.max(1, Math.round(viewportHeight * scale)),
  }
}
