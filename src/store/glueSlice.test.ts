import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { GLUE_GAP } from '../utils/glueGeometry'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

let spawnCursor = 0

/** Fresh notes far from the seed board, welded edge-to-edge when asked. Both
 * are pinned so their glue box is exactly their stored rectangle, not a
 * content-derived resting tile — the fixture's placement then matches the
 * geometry reconciliation reads. */
function createPair(gap = GLUE_GAP): [string, string] {
  const store = useWidgetStore.getState()
  const baseX = 40_000 + spawnCursor * 4_000
  spawnCursor += 1
  const a = store.createWidget('Glue A', { x: baseX, y: 40_000 }, 'notes')
  const b = store.createWidget('Glue B', { x: baseX + 2_000, y: 40_000 }, 'notes')
  pin(a)
  pin(b)
  const first = useWidgetStore.getState().widgets[a]!
  place(b, first.position.x + first.size.width + gap, first.position.y)
  return [a, b]
}

function place(id: string, x: number, y: number): void {
  const state = useWidgetStore.getState()
  const widget = state.widgets[id]!
  useWidgetStore.setState({
    widgets: { ...state.widgets, [id]: { ...widget, position: { x, y } } },
  })
}

function pin(id: string): void {
  const state = useWidgetStore.getState()
  const widget = state.widgets[id]!
  useWidgetStore.setState({
    widgets: {
      ...state.widgets,
      [id]: { ...widget, metadata: { ...widget.metadata, pinned: true } },
    },
  })
}

function widget(id: string) {
  return useWidgetStore.getState().widgets[id]!
}

describe('glue clusters', () => {
  it('welds two widgets into one cluster and indexes both members', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const state = useWidgetStore.getState()
    const glueId = state.widgetGlueIndex[a]!
    expect(glueId).toBeDefined()
    expect(state.widgetGlueIndex[b]).toBe(glueId)
    expect(state.glues[glueId]?.widgetIds.sort()).toEqual([a, b].sort())
  })

  it('merges two existing clusters into one when their members are glued', () => {
    const [a, b] = createPair()
    const [c, d] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(b, a)
    store.glueWidgets(d, c)
    useWidgetStore.getState().glueWidgets(c, b)
    const state = useWidgetStore.getState()
    const glueId = state.widgetGlueIndex[a]!
    expect([b, c, d].map((id) => state.widgetGlueIndex[id])).toEqual([glueId, glueId, glueId])
    expect(state.glues[glueId]?.widgetIds).toHaveLength(4)
    expect(Object.keys(state.glues)).toHaveLength(Object.keys(baseline.glues).length + 1)
  })

  it('never glues across canvases or a widget to itself', () => {
    const [a] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(a, a)
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBeUndefined()
  })

  it('unglues one member and dissolves a cluster left with fewer than two', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    expect(useWidgetStore.getState().unglueWidget(b)).toBe(true)
    const state = useWidgetStore.getState()
    expect(state.glues[glueId]).toBeUndefined()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    expect(state.unglueWidget(b)).toBe(false)
  })

  it('keeps a three-member cluster alive when one member is pulled off', () => {
    const [a, b] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(b, a)
    const second = widget(b)
    const c = store.createWidget('Glue C', { x: second.position.x + second.size.width + GLUE_GAP, y: second.position.y }, 'notes')
    pin(c)
    useWidgetStore.getState().glueWidgets(c, b)
    useWidgetStore.getState().unglueWidget(a)
    const state = useWidgetStore.getState()
    const glueId = state.widgetGlueIndex[b]!
    expect(state.glues[glueId]?.widgetIds.sort()).toEqual([b, c].sort())
    expect(state.widgetGlueIndex[a]).toBeUndefined()
  })

  it('splits a cluster whose connecting middle member is deleted', () => {
    // Row A — B — C where only B touches both ends. Deleting B must not leave
    // A and C glued into one record with empty space (and no seam) between them.
    const [a, b] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(b, a)
    const second = widget(b)
    const c = store.createWidget('Glue C', {
      x: second.position.x + second.size.width + GLUE_GAP,
      y: second.position.y,
    }, 'notes')
    pin(c)
    useWidgetStore.getState().glueWidgets(c, b)
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBe(useWidgetStore.getState().widgetGlueIndex[c])
    useWidgetStore.getState().deleteWidget(b)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[c]).toBeUndefined()
    expect(Object.values(state.glues).some((glue) => glue.widgetIds.includes(a) || glue.widgetIds.includes(c))).toBe(false)
  })

  it('detaches a member re-welded elsewhere from the cluster it left behind', () => {
    // A and B are glued. A is option-dragged out and welded to a far-off E.
    // The commit must leave {A, E} welded and free B, not keep all three in one
    // record spanning empty canvas.
    const [a, b] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(b, a)
    const first = widget(a)
    const e = store.createWidget('Glue E', { x: first.position.x + 20_000, y: 40_000 }, 'notes')
    pin(e)
    const target = widget(e)
    const landing = { x: target.position.x - GLUE_GAP - first.size.width, y: target.position.y }
    useWidgetStore.getState().setGlueIntent({ draggedId: a, targetId: e, position: landing, axis: 'x' })
    expect(useWidgetStore.getState().commitGlue()).toBe(true)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeDefined()
    expect(state.widgetGlueIndex[a]).toBe(state.widgetGlueIndex[e])
    expect(state.widgetGlueIndex[b]).toBeUndefined()
  })

  it('ungluing the middle of a row frees the two ends that no longer touch', () => {
    const [a, b] = createPair()
    const store = useWidgetStore.getState()
    store.glueWidgets(b, a)
    const second = widget(b)
    const c = store.createWidget('Glue C', {
      x: second.position.x + second.size.width + GLUE_GAP,
      y: second.position.y,
    }, 'notes')
    pin(c)
    useWidgetStore.getState().glueWidgets(c, b)
    // Menu-unglue the middle card. A, C are no longer adjacent, so neither
    // stays glued to the other.
    useWidgetStore.getState().unglueWidget(b)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[c]).toBeUndefined()
  })
})

describe('dragging glued widgets', () => {
  it('drags every clustermate along with the grabbed widget', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const beforeA = widget(a).position
    const beforeB = widget(b).position
    useWidgetStore.getState().moveWidget(a, { x: 120, y: 80 }, 1)
    expect(widget(a).position).toEqual({ x: beforeA.x + 120, y: beforeA.y + 80 })
    expect(widget(b).position).toEqual({ x: beforeB.x + 120, y: beforeB.y + 80 })
  })

  it('moves only the grabbed widget during an option-drag (soloGlued)', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const beforeA = widget(a).position
    const beforeB = widget(b).position
    useWidgetStore.getState().moveWidget(b, { x: 200, y: 0 }, 1, { soloGlued: true, moveSelection: false })
    expect(widget(a).position).toEqual(beforeA)
    expect(widget(b).position).toEqual({ x: beforeB.x + 200, y: beforeB.y })
  })

  it('settles a glue cluster rigidly so the 0.3-cell seam survives exactly', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    // Knock the whole cluster off-grid, as a drag release would leave it.
    useWidgetStore.getState().moveWidget(a, { x: 7, y: 7 }, 1)
    useWidgetStore.getState().settleWidgets([a])
    const after = useWidgetStore.getState()
    const seam = after.widgets[b]!.position.x -
      (after.widgets[a]!.position.x + after.widgets[a]!.size.width)
    expect(seam).toBe(GLUE_GAP)
    // The cluster's own corner landed back on the grid.
    expect(after.widgets[a]!.position.x % 40).toBe(0)
    expect(after.widgets[a]!.position.y % 40).toBe(0)
  })

  it('undoes a glue commit as part of the drag history step', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().snapshotHistory()
    useWidgetStore.getState().glueWidgets(b, a)
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBeDefined()
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBeUndefined()
    useWidgetStore.getState().redo()
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBeDefined()
  })

  it('persists glue clusters through a snapshot round trip', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const snapshot = buildBoardSnapshot(useWidgetStore.getState())
    const parsed = parsePersistedBoard(snapshot)!
    const glue = Object.values(parsed.glues).find((entry) => entry.widgetIds.includes(a))
    expect(glue?.widgetIds.sort()).toEqual([a, b].sort())
  })

  it('drops a deleted widget from its cluster and dissolves pairs', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    useWidgetStore.getState().deleteWidget(a)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    expect(Object.values(state.glues).some((glue) => glue.widgetIds.includes(b))).toBe(false)
  })
})
