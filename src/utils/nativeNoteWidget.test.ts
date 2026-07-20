import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { deriveNativeNoteWidgetSnapshot, NATIVE_NOTE_WIDGET_TEXT_MAX } from './nativeNoteWidget'

function note(overrides: Partial<Widget> = {}): Widget {
  return {
    id: 'note-1',
    type: 'notes',
    title: 'Launch thought',
    canvasId: 'canvas',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data: { text: 'Ship the native widget', mode: 'sticky', color: 'purple', attribution: '' },
    metadata: { badges: [] },
    ...overrides,
  }
}

describe('native note widget snapshot', () => {
  it('extracts only bounded, widget-safe Note data', () => {
    const widget = note({ data: { text: 'x'.repeat(NATIVE_NOTE_WIDGET_TEXT_MAX + 20), mode: 'quote', attribution: 'Ada' } })
    const snapshot = deriveNativeNoteWidgetSnapshot(widget.id, { [widget.id]: widget })
    expect(snapshot.note).toMatchObject({ id: 'note-1', title: 'Launch thought', mode: 'quote', color: 'yellow', attribution: 'Ada' })
    expect(snapshot.note?.text).toHaveLength(NATIVE_NOTE_WIDGET_TEXT_MAX)
  })

  it('never splits a surrogate pair at the truncation boundary', () => {
    // An emoji (two UTF-16 units) straddling the cap must be dropped whole —
    // a lone surrogate would be rejected as invalid JSON by the Rust boundary.
    const text = 'x'.repeat(NATIVE_NOTE_WIDGET_TEXT_MAX - 1) + '🌲🌲'
    const widget = note({ data: { text, mode: 'plain', color: 'yellow', attribution: '' } })
    const snapshot = deriveNativeNoteWidgetSnapshot(widget.id, { [widget.id]: widget })
    const result = snapshot.note!.text
    expect(result).toHaveLength(NATIVE_NOTE_WIDGET_TEXT_MAX - 1)
    expect(result.at(-1)).toBe('x')
    // Round-trips through JSON as well-formed text.
    expect(JSON.parse(JSON.stringify(result))).toBe(result)
  })

  it('clears native state for no selection, deletion, or a non-Note type', () => {
    const widget = note()
    expect(deriveNativeNoteWidgetSnapshot(null, { [widget.id]: widget }).note).toBeNull()
    expect(deriveNativeNoteWidgetSnapshot(widget.id, {}).note).toBeNull()
    expect(deriveNativeNoteWidgetSnapshot(widget.id, { [widget.id]: note({ type: 'checklist' }) }).note).toBeNull()
  })
})
