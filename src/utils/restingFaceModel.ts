import type { NoteCalloutTone, NoteSkinMode } from '../components/widgets/modules/noteSkinModel'

// ---------------------------------------------------------------------------
// The resting-face vocabulary.
//
// One card can wear many skins, and a folded card must still look like the
// skin it is wearing — a folded Sprint board reads as columns, a folded tape
// calculator reads as a tape. Rather than a bespoke component per skin (there
// are over two hundred), every skin picks one of the grammars below and fills
// it with its own reading. The grammar decides the shape; the widget's own
// skin model decides the words.
//
// Every grammar is BOUNDED by construction: the builders clamp rows, columns,
// cells, and characters before the model is ever built, so resting render cost
// is fixed no matter how much data a card holds. Nothing here is per-frame,
// stateful, or interactive.
//
// This module owns only the shapes and the small pure helpers that fill them.
// `restingFace.ts` owns the dispatch, the measurement, and the cache.
// ---------------------------------------------------------------------------

/** Semantic colour, resolved against the card's accent by the renderer. */
export type RestTone = 'neutral' | 'accent' | 'muted' | 'good' | 'warn' | 'bad'

/** The skin's own name for itself, mirroring the expanded card's heading. */
export interface RestEyebrow {
  label: string
  note?: string
  tone?: RestTone
}

export interface RestRow {
  key: string
  label: string
  /** Tri-state: undefined = the item has no completion concept. */
  done?: boolean
  /** Right-aligned trailing value (poll votes, budget amounts, metric tiles). */
  value?: string
  /** A small leading label the open card puts before the row: a clock time, a
   * step number, a rank. Rendered ahead of the completion glyph. */
  lead?: string
  tone?: RestTone
}

export interface RestColumn {
  key: string
  label: string
  /** The small right-hand reading in the expanded column header. */
  note?: string
  tone?: RestTone
  items: readonly RestRow[]
  overflow: number
}

export interface RestCell {
  key: string
  text: string
  tone?: RestTone
  /** 0–1 intensity for heatmap-style grids; ignored when absent. */
  fill?: number
  /** Marks the cell the expanded card would ring (today, the current step). */
  current?: boolean
}

export interface RestBar {
  key: string
  label: string
  value: string
  /** 0–1 of the track. */
  fraction: number
  tone?: RestTone
}

export interface RestChip {
  key: string
  text: string
  tone?: RestTone
  /** Renders as a filled pill rather than an outlined one. */
  filled?: boolean
}

export interface RestLine {
  key: string
  left: string
  right?: string
  tone?: RestTone
  dim?: boolean
}

export interface RestNode {
  key: string
  label: string
  caption?: string
  current?: boolean
}

export interface RestLane {
  key: string
  label: string
  /** Whole units from the left edge of the scale. */
  start: number
  span: number
  done?: boolean
  tone?: RestTone
}

export interface RestReadout {
  primary: string
  secondary: string
  tone?: RestTone
}

export type RestNoteLineKind = 'text' | 'heading' | 'bullet' | 'quote' | 'code' | 'rule'

export interface RestNoteLine {
  kind: RestNoteLineKind
  text: string
}

export interface RestNoteModel {
  kind: 'note'
  skin: NoteSkinMode
  lines: readonly RestNoteLine[]
  color?: 'yellow' | 'pink' | 'blue' | 'green' | 'purple'
  attribution?: string
  date?: string
  tone?: NoteCalloutTone
  versions?: readonly string[]
}

export type RestingFaceModel =
  | { kind: 'icon' }
  | { kind: 'image' }
  | { kind: 'metric'; primary: string; secondary: string; progress?: number; tone?: RestTone }
  | { kind: 'boolean'; label: string; active: boolean; shape?: 'switch' | 'checkbox' | 'power' }
  | { kind: 'text'; text: string; tint?: string }
  | RestNoteModel
  | { kind: 'rows'; rows: readonly RestRow[]; overflow: number; eyebrow?: RestEyebrow; meter?: number }
  | { kind: 'clock' }
  | {
      kind: 'chart'
      /** Readouts stacked down the right of the plot, most important first. */
      stats: readonly { label: string; value: string }[]
    }
  | { kind: 'stars'; value: number }
  | { kind: 'week' }
  | { kind: 'palette'; colors: readonly string[] }
  // --- skin grammars -------------------------------------------------------
  /** Side-by-side lanes of cards: boards, sprints, quadrants, week columns.
   * `wrap` folds the lanes into rows, which is how a 2×2 priority matrix keeps
   * being a matrix instead of flattening into four columns. */
  | { kind: 'columns'; columns: readonly RestColumn[]; wrap?: number; eyebrow?: RestEyebrow }
  /** A lattice of small cells: month calendars, heatmaps, tables, tallies. */
  | {
      kind: 'grid'
      cols: number
      header?: readonly string[]
      cells: readonly RestCell[]
      eyebrow?: RestEyebrow
      /** Cells are square rather than text-shaped (calendars, heatmaps). */
      dense?: boolean
    }
  /** Labelled horizontal bars: standings, weights, budgets, rota loads. */
  | { kind: 'bars'; bars: readonly RestBar[]; eyebrow?: RestEyebrow }
  /** A dial: goal rings, percentages, confidence, countdown sweeps. */
  | {
      kind: 'gauge'
      progress: number
      primary: string
      secondary: string
      caption?: string
      tone?: RestTone
    }
  /** A wrapped run of pills: tags, segments, chip lists, presets. */
  | { kind: 'chips'; chips: readonly RestChip[]; overflow: number; eyebrow?: RestEyebrow }
  /** Right-aligned ledger lines: calculator tape, terminals, histories. */
  | { kind: 'lines'; lines: readonly RestLine[]; eyebrow?: RestEyebrow; mono?: boolean; total?: RestLine }
  /** Connected nodes: linked lists, routes, step chains, pipelines. */
  | {
      kind: 'chain'
      nodes: readonly RestNode[]
      shape: 'linear' | 'doubly' | 'circular' | 'stack'
      overflow: number
      eyebrow?: RestEyebrow
    }
  /** Spans laid on a shared scale: project phases, intervals, shifts. */
  | { kind: 'timeline'; units: number; lanes: readonly RestLane[]; eyebrow?: RestEyebrow }
  /** Two readings that only mean something next to each other. */
  | { kind: 'split'; left: RestReadout; right: RestReadout; divider?: string; eyebrow?: RestEyebrow }
  /** A drawing surface: the paper's own ruling with a bounded ink preview. */
  | {
      kind: 'paper'
      pattern: 'plain' | 'grid' | 'dots' | 'board' | 'frames'
      /** Pre-simplified SVG path data in a 0–100 × 0–100 box. */
      strokes: readonly string[]
      frames?: number
      eyebrow?: RestEyebrow
    }

export interface RestingFace {
  model: RestingFaceModel
  size: { width: number; height: number }
}

// ---------------------------------------------------------------------------
// Bounds. Every builder clamps to these before a model exists, so a card with
// ten thousand rows costs exactly what a card with six rows costs.
// ---------------------------------------------------------------------------

export const REST_ROW_LIMIT = 6
export const REST_COLUMN_LIMIT = 4
export const REST_COLUMN_ITEM_LIMIT = 3
export const REST_CELL_LIMIT = 42
export const REST_BAR_LIMIT = 4
export const REST_CHIP_LIMIT = 8
export const REST_LINE_LIMIT = 5
export const REST_NODE_LIMIT = 4
export const REST_LANE_LIMIT = 4
export const REST_STROKE_LIMIT = 6
export const NOTE_REST_LINE_LIMIT = 5
export const NOTE_REST_VERSION_LIMIT = 3

// ---------------------------------------------------------------------------
// Shared reading helpers.
// ---------------------------------------------------------------------------

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Collapse whitespace and clip with an ellipsis — never a hard cut mid-word
 * when a word boundary is close enough to matter. */
export function compact(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean
}

export function formatRestNumber(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (magnitude >= 1_000) return `${Math.round(value / 100) / 10}k`
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10) / 10)
}

export function formatRestDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}
