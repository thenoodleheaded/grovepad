import { afterEach, describe, expect, it } from 'vitest'
import { makeRelation, makeWidget } from '../test/factories'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { computeBlockedWidgetIds } from './widgetGraph'
import { useWidgetStore } from './useWidgetStore'

// ---------------------------------------------------------------------------
// `blockedWidgetIds` is a derived index over `relations`: it has to be rebuilt
// in the same set() as every write to that map, or a card the board says is
// blocked silently loses its blocked treatment. Fourteen writers did this;
// importMindmap did not, and nothing later in the import flow recomputed it,
// so an imported blocker went unrecorded for the rest of the session.
//
// This file is the home for that invariant. The other writers can be added
// here as they are touched.
// ---------------------------------------------------------------------------

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

/** The payload shape ImportDocumentModal hands to importMindmap. */
function importPayload(canvasId: string) {
  const gate = makeWidget({ id: 'imp-gate', canvasId, position: { x: 20_000, y: 20_000 } })
  const blocked = makeWidget({ id: 'imp-blocked', canvasId, position: { x: 20_800, y: 20_000 } })
  const child = makeWidget({ id: 'imp-child', canvasId, position: { x: 21_600, y: 20_000 } })
  const widgets = Object.fromEntries([gate, blocked, child].map((widget) => [widget.id, widget]))
  // layoutMindmap stamps every imported relation isResolved: false.
  const relations = [
    makeRelation({ id: 'imp-blocker', fromId: gate.id, toId: blocked.id, type: 'blocker', isResolved: false }),
    makeRelation({ id: 'imp-parent', fromId: gate.id, toId: child.id, type: 'parent', isResolved: false }),
  ]
  return { widgets, relations, blockedId: blocked.id, childId: child.id }
}

describe('blockedWidgetIds tracks every writer of relations', () => {
  it('records a blocker that arrives through an import', () => {
    const canvasId = useWidgetStore.getState().activeCanvasId
    const { widgets, relations, blockedId, childId } = importPayload(canvasId)

    useWidgetStore.getState().importMindmap(widgets, relations)

    const state = useWidgetStore.getState()
    expect(state.blockedWidgetIds.has(blockedId)).toBe(true)
    // A parent relation is not a blocker, so its target must stay clear —
    // "block everything imported" would be just as wrong as blocking nothing.
    expect(state.blockedWidgetIds.has(childId)).toBe(false)
  })

  it('leaves the index exactly equal to a fresh recompute', () => {
    // Rebuilding from the wrong source (state.relations before the merge, say)
    // still produces a plausible-looking set; only the full comparison rejects it.
    const canvasId = useWidgetStore.getState().activeCanvasId
    const { widgets, relations } = importPayload(canvasId)

    useWidgetStore.getState().importMindmap(widgets, relations)

    const state = useWidgetStore.getState()
    expect([...state.blockedWidgetIds].sort())
      .toEqual([...computeBlockedWidgetIds(state.relations)].sort())
  })

  it('keeps blockers that were already on the board', () => {
    // The merge must not drop existing entries while adding the imported ones.
    const store = useWidgetStore.getState()
    const gate = store.createWidget('Existing gate', { x: 12_000, y: 12_000 }, 'notes')
    const existing = store.createWidget('Existing blocked', { x: 12_800, y: 12_000 }, 'notes')
    useWidgetStore.getState().addRelation(gate, existing, 'blocker')
    expect(useWidgetStore.getState().blockedWidgetIds.has(existing)).toBe(true)

    const canvasId = useWidgetStore.getState().activeCanvasId
    const { widgets, relations, blockedId } = importPayload(canvasId)
    useWidgetStore.getState().importMindmap(widgets, relations)

    const state = useWidgetStore.getState()
    expect(state.blockedWidgetIds.has(existing)).toBe(true)
    expect(state.blockedWidgetIds.has(blockedId)).toBe(true)
  })
})
