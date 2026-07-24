import type { NotesData, StickyNoteColor, Widget } from '../types/spatial'

const NATIVE_NOTE_WIDGET_SCHEMA_VERSION = 1 as const
const NATIVE_NOTE_WIDGET_TITLE_MAX = 120
export const NATIVE_NOTE_WIDGET_TEXT_MAX = 4_096

const NOTE_COLORS = new Set<StickyNoteColor>(['yellow', 'pink', 'blue', 'green', 'purple'])

interface NativeNoteWidgetNote {
  id: string
  title: string
  text: string
  color: StickyNoteColor
  mode: 'plain' | 'sticky' | 'quote'
  attribution: string
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
  if (!widget || widget.type !== 'notes') {
    return { schemaVersion: NATIVE_NOTE_WIDGET_SCHEMA_VERSION, note: null }
  }

  const data = widget.data as NotesData
  return {
    schemaVersion: NATIVE_NOTE_WIDGET_SCHEMA_VERSION,
    note: {
      id: bounded(widget.id, NATIVE_NOTE_WIDGET_TITLE_MAX),
      title: bounded(widget.title, NATIVE_NOTE_WIDGET_TITLE_MAX),
      text: bounded(data.text, NATIVE_NOTE_WIDGET_TEXT_MAX),
      color: NOTE_COLORS.has(data.color as StickyNoteColor) ? data.color as StickyNoteColor : 'yellow',
      mode: data.mode === 'sticky' || data.mode === 'quote' ? data.mode : 'plain',
      attribution: bounded(data.attribution, NATIVE_NOTE_WIDGET_TITLE_MAX),
    },
  }
}

export function serializeNativeNoteWidgetSnapshot(snapshot: NativeNoteWidgetSnapshot): string {
  return JSON.stringify(snapshot)
}
