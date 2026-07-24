import { afterEach, describe, expect, it } from 'vitest'
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

  it('absorbs an expanded card’s view offset so pinning never moves it on screen', () => {
    // The expanded card is drawn at position+offset; a pinned card draws at
    // its stored position. Pinning hands the offset to the store so the two
    // agree — without it the card jumped diagonally by the whole offset.
    const id = firstId()
    const before = useWidgetStore.getState().widgets[id]!
    useWidgetStore.getState().toggleWidgetPinned(id, { absorbOffset: { x: -140, y: -60 } })

    const pinned = useWidgetStore.getState().widgets[id]!
    expect(pinned.metadata.pinned).toBe(true)
    expect(pinned.position).toEqual({ x: before.position.x - 140, y: before.position.y - 60 })

    // One history step: undo reverses the pin AND the absorbed move together.
    useWidgetStore.getState().undo()
    const undone = useWidgetStore.getState().widgets[id]!
    expect(undone.metadata.pinned).toBeFalsy()
    expect(undone.position).toEqual(before.position)
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
