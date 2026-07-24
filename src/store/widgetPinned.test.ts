import { afterEach, describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { isWidgetResting } from '../utils/widgetRest'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

const firstId = () => Object.keys(useWidgetStore.getState().widgets)[0]!

describe('pinned widgets', () => {
  it('toggles, and holds the card out of rest while pinned', () => {
    const id = firstId()
    const ctx = { expandedWidgetId: null }
    expect(isWidgetResting(useWidgetStore.getState().widgets[id]!, ctx)).toBe(true)

    useWidgetStore.getState().toggleWidgetPinned(id)
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinned).toBe(true)
    expect(isWidgetResting(useWidgetStore.getState().widgets[id]!, ctx)).toBe(false)

    useWidgetStore.getState().toggleWidgetPinned(id)
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinned).toBe(false)
    expect(isWidgetResting(useWidgetStore.getState().widgets[id]!, ctx)).toBe(true)
  })

  it('leaves position locking alone', () => {
    // Pin and lock are separate promises now: pin holds a card open, lock
    // holds it still. Toggling one must not quietly do the other's job.
    const id = firstId()
    useWidgetStore.getState().toggleWidgetPinned(id)
    expect(useWidgetStore.getState().widgets[id]!.metadata.locked).toBeFalsy()
    useWidgetStore.getState().toggleWidgetLocked(id)
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinned).toBe(true)
    expect(useWidgetStore.getState().widgets[id]!.metadata.locked).toBe(true)
  })

  it('absorbs an expanded card’s view offset onto the grid when pinning', () => {
    // The expanded card is drawn at position+offset; a pinned card draws at
    // its stored position. Pinning hands the offset to the store so the two
    // agree — and the result lands ON the grid, because the settle pass
    // anchors a pinned card without re-snapping it: an off-grid pin would
    // shove its whole cluster off rhythm by exactly that fraction.
    const id = firstId()
    const before = useWidgetStore.getState().widgets[id]!
    useWidgetStore.getState().toggleWidgetPinned(id, { absorbOffset: { x: -140, y: -60 } })

    const pinned = useWidgetStore.getState().widgets[id]!
    expect(pinned.metadata.pinned).toBe(true)
    expect(Math.abs(pinned.position.x % GRID_SIZE)).toBe(0)
    expect(Math.abs(pinned.position.y % GRID_SIZE)).toBe(0)
    // Still the absorbed spot, up to the snap's half-cell rounding.
    expect(Math.abs(pinned.position.x - (before.position.x - 140))).toBeLessThanOrEqual(GRID_SIZE / 2)
    expect(Math.abs(pinned.position.y - (before.position.y - 60))).toBeLessThanOrEqual(GRID_SIZE / 2)

    // One history step: undo reverses the pin AND the absorbed move together.
    useWidgetStore.getState().undo()
    const undone = useWidgetStore.getState().widgets[id]!
    expect(undone.metadata.pinned).toBeFalsy()
    expect(undone.position).toEqual(before.position)
  })

  it('returns an icon to its icon, not to a resting face, when it is unpinned', () => {
    // Open an icon, pin it (the card is now an ordinary full card), then let
    // it go. It has to come back as the icon it was — at the same square, on
    // the same spot — instead of dropping onto a resting tile it never showed.
    const id = firstId()
    useWidgetStore.getState().setWidgetScaleState(id, 'icon')
    const iconSize = { ...useWidgetStore.getState().widgets[id]!.size }
    useWidgetStore.getState().setWidgetScaleState(id, 'full')

    useWidgetStore.getState().toggleWidgetPinned(id, { from: { kind: 'icon', ...iconSize } })
    const pinned = useWidgetStore.getState().widgets[id]!
    // The card the user is looking at while it is pinned — the icon has to
    // fold back into the middle of exactly this box.
    const cardCentre = {
      x: pinned.position.x + pinned.size.width / 2,
      y: pinned.position.y + pinned.size.height / 2,
    }
    expect(pinned.metadata.pinned).toBe(true)
    expect(pinned.iconified).toBeFalsy()
    expect(pinned.metadata.pinnedFrom).toEqual({ kind: 'icon', ...iconSize })

    useWidgetStore.getState().toggleWidgetPinned(id)
    const unpinned = useWidgetStore.getState().widgets[id]!
    expect(unpinned.iconified).toBe(true)
    expect(unpinned.size).toEqual(iconSize)
    // Folded back onto its own middle, so the icon lands where the card was.
    expect(unpinned.position.x + unpinned.size.width / 2).toBeCloseTo(cardCentre.x, 0)
    expect(unpinned.position.y + unpinned.size.height / 2).toBeCloseTo(cardCentre.y, 0)
    // The memory is spent, not left lying around for the next pin.
    expect(unpinned.metadata.pinnedFrom).toBeUndefined()
  })

  it('still falls back to the resting face for a card pinned from rest', () => {
    const id = firstId()
    useWidgetStore.getState().toggleWidgetPinned(id, { from: { kind: 'rest' } })
    useWidgetStore.getState().toggleWidgetPinned(id)
    const widget = useWidgetStore.getState().widgets[id]!
    expect(widget.iconified).toBeFalsy()
    expect(isWidgetResting(widget, { expandedWidgetId: null })).toBe(true)
  })

  it('carries the pin memory through a save/load round trip, and drops a stale one', () => {
    const id = firstId()
    useWidgetStore.getState().toggleWidgetPinned(id, {
      from: { kind: 'icon', width: 120, height: 120 },
    })
    const reloaded = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    useWidgetStore.getState().loadBoard(reloaded)
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinnedFrom)
      .toEqual({ kind: 'icon', width: 120, height: 120 })
    // Unpinning it after the reload still restores the icon it remembers.
    useWidgetStore.getState().toggleWidgetPinned(id)
    expect(useWidgetStore.getState().widgets[id]!.iconified).toBe(true)
  })

  it('is undoable and survives a save/load round trip', () => {
    const id = firstId()
    useWidgetStore.getState().toggleWidgetPinned(id)
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinned).toBeFalsy()

    useWidgetStore.getState().toggleWidgetPinned(id)
    const reloaded = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    useWidgetStore.getState().loadBoard(reloaded)
    expect(useWidgetStore.getState().widgets[id]!.metadata.pinned).toBe(true)
  })
})
