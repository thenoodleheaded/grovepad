/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shallow } from 'zustand/shallow'
import type { Widget } from '../../../types/spatial'
import { canvasMembers } from './CanvasNodeWidget'

const widget = readFileSync(new URL('./CanvasNodeWidget.tsx', import.meta.url), 'utf8')

function card(id: string, canvasId: string, x: number): Widget {
  return {
    id,
    canvasId,
    type: 'text',
    title: id,
    position: { x, y: 0 },
    size: { width: 200, height: 120 },
    data: {},
    metadata: { badges: [] },
  } as unknown as Widget
}

/**
 * A canvas card summarises ONE canvas, but the store record it reads is the
 * whole workspace. Subscribing to that record made every canvas card re-render
 * — and re-run two full scans plus a localeCompare sort — on every pointer-move
 * frame of any drag anywhere on the board, because `moveWidget` hands back a
 * fresh `widgets` object per delta. Nothing about the card's output changes, so
 * only these two things can catch a regression: the shape of the subscription,
 * and the shallow-stability that makes it worth having.
 */
describe('canvas card subscribes only to its own canvas', () => {
  it('keeps entry references stable when a widget on another canvas moves', () => {
    const before = { a: card('a', 'mine', 0), b: card('b', 'other', 0) }
    // Exactly what a drag delta produces: a fresh record whose moved entry is
    // a new object, and whose untouched entries are the same references.
    const after = { ...before, b: card('b', 'other', 40) }

    const scopedBefore = canvasMembers(before, 'mine')
    const scopedAfter = canvasMembers(after, 'mine')

    expect(Object.keys(scopedBefore)).toEqual(['a'])
    // The whole point: useShallow sees these as equal and skips the render,
    // whereas `before !== after` for the unscoped record every single frame.
    expect(shallow(scopedBefore, scopedAfter)).toBe(true)
    expect(before === after).toBe(false)
  })

  it('still reports a change when a widget on its own canvas moves', () => {
    // The control: a scope that never changes would pass the test above.
    const before = { a: card('a', 'mine', 0) }
    const after = { a: card('a', 'mine', 40) }
    expect(shallow(canvasMembers(before, 'mine'), canvasMembers(after, 'mine'))).toBe(false)
  })

  it('preserves insertion order, so the preview picks the same members', () => {
    const record = { a: card('a', 'mine', 0), z: card('z', 'other', 0), b: card('b', 'mine', 0) }
    expect(Object.keys(canvasMembers(record, 'mine'))).toEqual(['a', 'b'])
  })

  it('wires the scope through useShallow instead of the whole widgets record', () => {
    // Without useShallow the selector allocates a fresh object every notify and
    // the card re-renders exactly as often as it did before.
    expect(widget).toContain('useShallow((state) => canvasMembers(state.widgets, data.canvasId))')
    expect(widget).not.toMatch(/useWidgetStore\(\(state\) => state\.widgets\)/)
  })
})
