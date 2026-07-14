import { describe, expect, it } from 'vitest'
import { createHistorySession } from './widgetHistory'

describe('widget history session', () => {
  it('moves snapshots through undo and redo', () => {
    const history = createHistorySession<number>()
    history.capture(1)
    expect(history.undo(2)).toBe(1)
    expect(history.status()).toEqual({ canUndo: false, canRedo: true })
    expect(history.redo(1)).toBe(2)
    expect(history.status()).toEqual({ canUndo: true, canRedo: false })
  })

  it('coalesces rapid edits with the same tag', () => {
    let timestamp = 1_000
    const history = createHistorySession<number>({ now: () => timestamp, coalesceMs: 900 })
    expect(history.capture(1, 'title:alpha')).toBe(true)
    timestamp += 200
    expect(history.capture(2, 'title:alpha')).toBe(false)
    expect(history.undo(3)).toBe(1)
  })

  it('clears both directions at the hydration boundary', () => {
    const history = createHistorySession<number>()
    history.capture(1)
    history.undo(2)
    history.clear()
    expect(history.status()).toEqual({ canUndo: false, canRedo: false })
    expect(history.redo(3)).toBeNull()
  })

  it('enforces the configured snapshot limit', () => {
    const history = createHistorySession<number>({ limit: 2 })
    history.capture(1)
    history.capture(2)
    history.capture(3)
    expect(history.undo(4)).toBe(3)
    expect(history.undo(3)).toBe(2)
    expect(history.undo(2)).toBeNull()
  })
})
