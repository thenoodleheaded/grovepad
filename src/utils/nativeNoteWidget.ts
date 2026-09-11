import type { TextData, StickyNoteColor, Widget } from '../types/spatial'

const NATIVE_NOTE_WIDGET_SCHEMA_VERSION = 1 as const
const NATIVE_NOTE_WIDGET_TITLE_MAX = 120
export const NATIVE_NOTE_WIDGET_TEXT_MAX = 4_096

/**
 * The five colours every native renderer already switches on. The web sticky
 * offers four more; a name the Swift/Glance side has never heard of would fall
 * through its `switch` to a default, so the extras fold onto their nearest
 * neighbour here instead of crossing the boundary as an unknown string.
 */
const NOTE_COLORS = new Set<StickyNoteColor>(['yellow', 'pink', 'blue', 'green', 'purple'])

const NATIVE_COLOR_FOLD: Partial<Record<StickyNoteColor, StickyNoteColor>> = {
  orange: 'yellow',
  teal: 'green',
  // Red folds to pink rather than to yellow: pink is the warm alarm tone on
  // the native side, and a red note landing on yellow would lose that reading.
  red: 'pink',
  lime: 'green',
}

function nativeNoteColor(raw: unknown): StickyNoteColor {
  const color = raw as StickyNoteColor
  if (NOTE_COLORS.has(color)) return color
  return NATIVE_COLOR_FOLD[color] ?? 'yellow'
}

interface NativeNoteWidgetNote {
  id: string
  title: string
  text: string
  color: StickyNoteColor
  mode: 'plain' | 'sticky'
}

export interface NativeNoteWidgetSnapshot {
  schemaVersion: typeof NATIVE_NOTE_WIDGET_SCHEMA_VERSION
  note: NativeNoteWidgetNote | null
}

function bounded(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const sliced = value.slice(0, maxLength)
  // A cut that lands inside a surrogate pair leaves a lone high surrogate;
  // serde_json on the Rust boundary rejects that as invalid JSON text, which
  // would wedge sync for this note. Drop the half-character instead.
  const last = sliced.charCodeAt(sliced.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced
}

/** Derive the tiny, deterministic payload native extensions can render. */
export function deriveNativeNoteWidgetSnapshot(
  selectedWidgetId: string | null,
  widgets: Readonly<Record<string, Widget>>,
): NativeNoteWidgetSnapshot {
  const widget = selectedWidgetId ? widgets[selectedWidgetId] : undefined
  if (!widget || widget.type !== 'text') {
    return { schemaVersion: NATIVE_NOTE_WIDGET_SCHEMA_VERSION, note: null }
  }

  const data = widget.data as TextData
  return {
    schemaVersion: NATIVE_NOTE_WIDGET_SCHEMA_VERSION,
    note: {
      id: bounded(widget.id, NATIVE_NOTE_WIDGET_TITLE_MAX),
      title: bounded(widget.title, NATIVE_NOTE_WIDGET_TITLE_MAX),
      text: bounded(data.text, NATIVE_NOTE_WIDGET_TEXT_MAX),
      color: nativeNoteColor(data.color),
      mode: data.mode === 'sticky' ? 'sticky' : 'plain',
    },
  }
}

export function serializeNativeNoteWidgetSnapshot(snapshot: NativeNoteWidgetSnapshot): string {
  return JSON.stringify(snapshot)
}
