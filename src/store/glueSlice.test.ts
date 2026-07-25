import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import {
  COLLAPSED_MEMBER_SIZE,
  GLUE_GAP,
  GLUE_RANGE,
  glueBoxRect,
  glueSeparation,
} from '../utils/glueGeometry'
import { restingTileSize } from '../utils/widgetRest'
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

  it('closes ranks instead of splitting when the connecting middle member is deleted', () => {
    // Row A — B — C where only B touches both ends. Deleting B pulls A and C
    // back together until they weld again, so the group survives as ONE record
    // — never a record spanning empty canvas, and never a split-apart group.
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
    useWidgetStore.getState().deleteWidgets([b])
    const state = useWidgetStore.getState()
    const glueId = state.widgetGlueIndex[a]
    expect(glueId).toBeDefined()
    expect(state.widgetGlueIndex[c]).toBe(glueId)
    expect(state.glues[glueId!]?.widgetIds.sort()).toEqual([a, c].sort())
    // The survivors physically touch again — the gap B left is closed.
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[c]!)),
    ).toBe(0)
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

  it('closes ranks when the middle of a row is unglued — the ends keep the group', () => {
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
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    // Pull the middle card out. A and C are innocent: they were welded to the
    // GROUP, not to the card that left, so they re-magnetize onto each other
    // and keep the group instead of being ungrouped by someone else's exit.
    useWidgetStore.getState().unglueWidget(b)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    expect(state.widgetGlueIndex[a]).toBe(glueId)
    expect(state.widgetGlueIndex[c]).toBe(glueId)
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[c]!)),
    ).toBe(0)
  })

  it('leaves the freed widget selected alone, so it cannot drag its old group', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    // Selecting a member selects the whole cluster.
    useWidgetStore.getState().selectWidget(b, false)
    expect(useWidgetStore.getState().selectedIds.size).toBe(2)
    useWidgetStore.getState().unglueWidget(b)
    const selected = [...useWidgetStore.getState().selectedIds]
    expect(selected).toEqual([b])
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

  it('anchors the rigid snap on the stationary member, so welding never shoves the target', () => {
    const [a, b] = createPair()
    // A sits on the grid (an untouched weld target); B just welded onto its
    // right edge at the exact seam — off-grid on the bond axis by GLUE_GAP.
    const first = widget(a)
    place(a, 40_000, 40_000)
    place(b, 40_000 + first.size.width + GLUE_GAP, 40_000)
    useWidgetStore.getState().glueWidgets(b, a)
    useWidgetStore.getState().settleWidgets([b])
    const after = useWidgetStore.getState()
    // The on-grid target holds its ground; the fresh weld keeps its seam.
    expect(after.widgets[a]!.position).toEqual({ x: 40_000, y: 40_000 })
    expect(after.widgets[b]!.position.x -
      (after.widgets[a]!.position.x + after.widgets[a]!.size.width)).toBe(GLUE_GAP)
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
    useWidgetStore.getState().deleteWidgets([a])
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    expect(Object.values(state.glues).some((glue) => glue.widgetIds.includes(b))).toBe(false)
  })

  it('ungroups a whole cluster back into free widgets without deleting any', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().unglueCluster(glueId)
    const state = useWidgetStore.getState()
    expect(state.glues[glueId]).toBeUndefined()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    // Neither widget is deleted — only the weld is gone.
    expect(state.widgets[a]).toBeDefined()
    expect(state.widgets[b]).toBeDefined()
    // Ungroup rides its own history step.
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgetGlueIndex[a]).toBe(glueId)
  })

  it('holds a member on its weld through a scale change, and a round trip restores the layout exactly', () => {
    // A welded member is anchored, not re-centred: it keeps the corner it was
    // welded at while the cluster gives way or closes ranks around it. That is
    // what makes opening and closing a card inside a group reversible —
    // re-centring walked the card, and the whole group, by half the size
    // difference on every single open and close.
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const before = { a: { ...widget(a).position }, b: { ...widget(b).position } }

    useWidgetStore.getState().setWidgetScaleState(b, 'icon')
    const folded = useWidgetStore.getState()
    expect(folded.widgetGlueIndex[a]).toBe(glueId)
    expect(folded.widgetGlueIndex[b]).toBe(glueId)
    expect(folded.widgets[b]!.position).toEqual(before.b)

    useWidgetStore.getState().setWidgetScaleState(b, 'full')
    const reopened = useWidgetStore.getState()
    expect(reopened.widgets[a]!.position).toEqual(before.a)
    expect(reopened.widgets[b]!.position).toEqual(before.b)
    expect(reopened.widgetGlueIndex[b]).toBe(glueId)
  })

  it('closes ranks when unpinning shrinks a member back to an icon', () => {
    // Unpinning is the shrink half of pinning: the card that was held open
    // gives its space back. Nothing in the overlap check ever pulls anything
    // closer, so without a close-ranks pass the group keeps a card-sized hole
    // where the open card used to be.
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
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    // The fixture pins every member; give the MIDDLE one the memory of an icon
    // so unpinning shrinks it back to that square and opens a hole after it.
    useWidgetStore.getState().updateWidgetMetadata(b, {
      pinnedFrom: { kind: 'icon', width: 80, height: 80 },
    })

    useWidgetStore.getState().toggleWidgetPinned(b)
    const state = useWidgetStore.getState()
    expect(state.widgets[b]!.iconified).toBe(true)
    // C closed up onto the shrunken B instead of being left stranded a card's
    // width away — and the group is still one group.
    expect(
      glueSeparation(glueBoxRect(state.widgets[b]!), glueBoxRect(state.widgets[c]!)),
    ).toBeLessThanOrEqual(GLUE_RANGE)
    expect(state.widgetGlueIndex[c]).toBe(glueId)
    expect(state.widgetGlueIndex[b]).toBe(glueId)
  })

  it('closes the weld back up when a glued member shrinks', () => {
    // A committed shrink (content-fit convergence, an inward edge drag) opens
    // a hole in the weld; the cluster pulls back together instead of leaving
    // a gap that would split the group at the next reconcile.
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const wa = widget(a)
    useWidgetStore.getState().resizeWidget(a, { width: wa.size.width - 80, height: wa.size.height })
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBe(glueId)
    expect(state.widgetGlueIndex[b]).toBe(glueId)
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[b]!)),
    ).toBe(0)
  })

  it('an option-drag pull-off lands exactly where it was released', () => {
    // The freed card is the acting widget: under the pointer, at the spot the
    // preview promised. The cluster makes room around it — anchoring the
    // survivors instead would shove the card somewhere the user never dropped
    // it, which is the drop-does-not-equal-the-preview bug in reverse.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const wb = widget(b)
    const c = useWidgetStore
      .getState()
      .createWidget('Glue C', { x: wb.position.x + 2_000, y: wb.position.y }, 'notes')
    pin(c)
    place(c, wb.position.x + wb.size.width, wb.position.y)
    useWidgetStore.getState().glueWidgets(c, b)

    // An ⌥-drag arms no displacement, so a short pull-off is released still
    // overlapping the clustermate it came from — welding nothing.
    place(c, widget(b).position.x + 20, widget(b).position.y + 7)
    const released = { ...widget(c).position }
    useWidgetStore.getState().unglueWidget(c, { skipHistory: true, heldByPointer: true })

    expect(useWidgetStore.getState().widgets[c]!.position).toEqual(released)
  })

  it('does not bury a card unglued from the context menu under its former clustermates', () => {
    // The menu path has no drag: the freed card is still standing where it
    // was, so the survivors closing ranks would slide straight through it.
    // WidgetCard's own settle rescues the option-drag path; the menu has none.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const wb = widget(b)
    const c = useWidgetStore
      .getState()
      .createWidget('Glue C', { x: wb.position.x + 2_000, y: wb.position.y }, 'notes')
    pin(c)
    place(c, wb.position.x + wb.size.width, wb.position.y)
    useWidgetStore.getState().glueWidgets(c, b)

    useWidgetStore.getState().unglueWidget(b)

    const state = useWidgetStore.getState()
    const freed = glueBoxRect(state.widgets[b]!)
    for (const otherId of [a, c]) {
      const other = glueBoxRect(state.widgets[otherId]!)
      const overlapX =
        Math.min(freed.x + freed.width, other.x + other.width) - Math.max(freed.x, other.x)
      const overlapY =
        Math.min(freed.y + freed.height, other.y + other.height) - Math.max(freed.y, other.y)
      expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(0)
    }
  })

  it('closes the weld when a glued member shrinks by a single cell', () => {
    // The hole a shrink opens is measured against what RENDERS as welded, not
    // against the option-drag reach: a one-cell hole leaves the record intact,
    // so nothing else was ever going to close it, and the pair stopped drawing
    // its seam while the group frame still enclosed both.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const wa = widget(a)
    useWidgetStore
      .getState()
      .resizeWidget(a, { width: wa.size.width - GRID_SIZE, height: wa.size.height })
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBe(glueId)
    expect(state.widgetGlueIndex[b]).toBe(glueId)
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[b]!)),
    ).toBe(0)
  })

  it('closes the weld when a glued member is shrunk from its outline edge', () => {
    // The edge-drag path suppresses resizeWidget's own settle and runs its
    // own, so it has to close the cluster itself — otherwise dragging a
    // member's edge inward detaches it from the group it still belongs to.
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const wa = widget(a)
    useWidgetStore
      .getState()
      .resizeWidgetFromEdge(
        a,
        { width: wa.size.width - GRID_SIZE * 3, height: wa.size.height },
        { x: 1, y: 0 },
        true,
      )
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBe(glueId)
    expect(state.widgetGlueIndex[b]).toBe(glueId)
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[b]!)),
    ).toBe(0)
  })

  it('drops a member that no longer touches from the record at settle time', () => {
    // However a member ended up visually free of its group, the next settle
    // reconciles the record — so a card that touches nothing can never keep
    // dragging the whole group with it.
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    place(b, widget(a).position.x + 2_000, widget(a).position.y)
    useWidgetStore.getState().settleWidgets([a])
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
  })

  it('heals a stale record on board load — membership equals what touches', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    place(b, widget(a).position.x + 2_000, widget(a).position.y)
    const snapshot = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    useWidgetStore.getState().loadBoard(snapshot)
    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    // Positions are NOT settled by a load — only the record is healed.
    expect(state.widgets[b]!.position.x).toBe(widget(a).position.x + 2_000)
  })

  it('pushes ungrouped members physically apart — the split is visible, not just bookkeeping', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().unglueCluster(glueId)
    const state = useWidgetStore.getState()
    // The cards no longer touch: a clear gap opens between them, so nothing
    // keeps reading (or settling) as one welded object after the record died.
    const separation = glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[b]!))
    expect(separation).toBeGreaterThanOrEqual(GRID_SIZE / 2)
    // And they land back on the grid.
    expect(Math.abs(state.widgets[a]!.position.x % GRID_SIZE)).toBe(0)
    expect(Math.abs(state.widgets[b]!.position.x % GRID_SIZE)).toBe(0)
  })

  it('names a cluster and clears the name back to default', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().renameGlue(glueId, '  Launch  plan  ')
    expect(useWidgetStore.getState().glues[glueId]!.name).toBe('Launch plan')
    useWidgetStore.getState().renameGlue(glueId, '   ')
    expect(useWidgetStore.getState().glues[glueId]!.name).toBeUndefined()
  })

  it('collapses every member to a single-cell icon and stacks them like a ghost node', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    const collapsed = useWidgetStore.getState()
    expect(collapsed.widgets[a]!.iconified).toBe(true)
    expect(collapsed.widgets[b]!.iconified).toBe(true)
    // 1×1 each — a folded collection is one pointer target, so its members sit
    // below the 2×2 floor that governs icons you aim at individually.
    expect(collapsed.widgets[a]!.size).toEqual(COLLAPSED_MEMBER_SIZE)
    expect(collapsed.widgets[b]!.size).toEqual(COLLAPSED_MEMBER_SIZE)
    // Members re-pack touching on the grid, still one welded cluster.
    const left = [collapsed.widgets[a]!, collapsed.widgets[b]!].sort((x, y) => x.position.x - y.position.x)
    expect(left[1]!.position.x - (left[0]!.position.x + left[0]!.size.width)).toBe(0)
    expect(left[0]!.position.x % 40).toBe(0)
    expect(collapsed.widgetGlueIndex[a]).toBe(glueId)
    // Expanding restores full cards.
    useWidgetStore.getState().setClusterCollapsed(glueId, false)
    expect(useWidgetStore.getState().widgets[a]!.iconified).toBe(false)
  })

  it('restores every member to the exact position, size and scale state it was folded from', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    // One member starts as an icon, so the fold has two different states to
    // remember — not just "everything was a full card".
    useWidgetStore.getState().setWidgetScaleState(b, 'icon')
    const before = {
      a: { ...widget(a).position, ...widget(a).size, icon: widget(a).iconified === true },
      b: { ...widget(b).position, ...widget(b).size, icon: widget(b).iconified === true },
    }
    expect(before.b.icon).toBe(true)

    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    const folded = useWidgetStore.getState()
    expect(folded.glues[glueId]!.collapsed).toBe(true)
    expect(folded.widgets[a]!.iconified).toBe(true)
    expect(folded.widgets[b]!.iconified).toBe(true)

    useWidgetStore.getState().setClusterCollapsed(glueId, false)
    const after = useWidgetStore.getState()
    // Exactly what the fold replaced comes back — including the member that
    // was already an icon, which must NOT be opened by the unfold.
    expect(after.widgets[a]!.position).toEqual({ x: before.a.x, y: before.a.y })
    expect(after.widgets[a]!.size).toEqual({ width: before.a.width, height: before.a.height })
    expect(after.widgets[a]!.iconified === true).toBe(before.a.icon)
    expect(after.widgets[b]!.position).toEqual({ x: before.b.x, y: before.b.y })
    expect(after.widgets[b]!.size).toEqual({ width: before.b.width, height: before.b.height })
    expect(after.widgets[b]!.iconified === true).toBe(true)
    // The fold record is cleared once it has been spent.
    expect(after.glues[glueId]!.collapsed).toBeUndefined()
    expect(after.glues[glueId]!.restore).toBeUndefined()
  })

  it('expands a group around where it sits NOW, not where it was folded', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const beforeA = { ...widget(a).position }
    const beforeB = { ...widget(b).position }
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    // Drag the folded block eight cells right and two down (the whole-cluster
    // move a plain drag performs), then expand: the members open translated by
    // that same travel instead of rewinding to their pre-collapse coordinates.
    const shift = { x: 8 * GRID_SIZE, y: 2 * GRID_SIZE }
    for (const id of [a, b]) {
      const w = widget(id)
      place(id, w.position.x + shift.x, w.position.y + shift.y)
    }
    useWidgetStore.getState().setClusterCollapsed(glueId, false)
    const after = useWidgetStore.getState()
    expect(after.widgets[a]!.position).toEqual({ x: beforeA.x + shift.x, y: beforeA.y + shift.y })
    expect(after.widgets[b]!.position).toEqual({ x: beforeB.x + shift.x, y: beforeB.y + shift.y })
  })

  it('keeps a dragged folded block in place when a member leaves before the expand', () => {
    // Re-folding after a membership change writes a FRESH fold anchor from the
    // survivors' current positions. The restore map was written in the old
    // anchor's frame, so unless it rides the same travel the block's recorded
    // shift reads zero and every survivor rewinds to where the group was first
    // folded — a group dragged across the board teleports back on expand.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const wb = widget(b)
    const c = useWidgetStore
      .getState()
      .createWidget('Glue C', { x: wb.position.x + 2_000, y: wb.position.y }, 'notes')
    pin(c)
    place(c, wb.position.x + wb.size.width, wb.position.y)
    useWidgetStore.getState().glueWidgets(c, b)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const beforeA = { ...widget(a).position }
    const beforeB = { ...widget(b).position }
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    const shift = { x: 10 * GRID_SIZE, y: 3 * GRID_SIZE }
    for (const id of [a, b, c]) {
      const w = widget(id)
      place(id, w.position.x + shift.x, w.position.y + shift.y)
    }
    useWidgetStore.getState().unglueWidget(c)
    useWidgetStore.getState().setClusterCollapsed(glueId, false)

    const after = useWidgetStore.getState()
    expect(after.widgets[a]!.position).toEqual({ x: beforeA.x + shift.x, y: beforeA.y + shift.y })
    expect(after.widgets[b]!.position).toEqual({ x: beforeB.x + shift.x, y: beforeB.y + shift.y })
  })

  it('spreads the cards apart when a COLLAPSED group is ungrouped', () => {
    // Ungrouping is a physical split whichever state the group was in. A
    // collapsed group restores its members to the welded positions it folded
    // them from, so skipping the spread left them stored flush — looking
    // exactly as grouped as before, minus the frame.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    useWidgetStore.getState().unglueCluster(glueId)

    const state = useWidgetStore.getState()
    expect(state.widgetGlueIndex[a]).toBeUndefined()
    expect(state.widgetGlueIndex[b]).toBeUndefined()
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[b]!)),
    ).toBeGreaterThan(0)
  })

  it('re-derives membership when a group is expanded', () => {
    // Collapse/expand was the one footprint-changing action that never
    // reconciled. A member unglued while the group was folded leaves a hole in
    // the restore map, so the survivors open far apart — and without a
    // reconcile they keep dragging as one object across that gap.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const wb = widget(b)
    const c = useWidgetStore
      .getState()
      .createWidget('Glue C', { x: wb.position.x + 2_000, y: wb.position.y }, 'notes')
    pin(c)
    place(c, wb.position.x + wb.size.width, wb.position.y)
    useWidgetStore.getState().glueWidgets(c, b)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    useWidgetStore.getState().unglueWidget(b)

    useWidgetStore.getState().setClusterCollapsed(glueId, false)

    const state = useWidgetStore.getState()
    const survivors = [a, c].filter((id) => state.widgetGlueIndex[id])
    // Assert the group SURVIVED before measuring it. Without this the loop
    // below runs zero times when the record has been destroyed, and the test
    // passes green on exactly the outcome the fix exists to prevent.
    expect(survivors).toHaveLength(2)
    expect(state.glues[state.widgetGlueIndex[a]!]?.widgetIds).toHaveLength(2)
    expect(
      glueSeparation(glueBoxRect(state.widgets[a]!), glueBoxRect(state.widgets[c]!)),
    ).toBe(0)
    for (const id of survivors) {
      const mates = state.glues[state.widgetGlueIndex[id]!]!.widgetIds.filter((m) => m !== id)
      for (const mate of mates) {
        expect(
          glueSeparation(glueBoxRect(state.widgets[id]!), glueBoxRect(state.widgets[mate]!)),
        ).toBeLessThanOrEqual(GLUE_RANGE)
      }
    }
  })

  it('never pastes a folded group as sub-floor icons', () => {
    // The clipboard carries widget records, not glue records, so a pasted
    // member of a collapsed group belongs to no cluster — and a 1×1 icon
    // outside a folded cluster is below the aim-at floor with nothing to
    // click. It comes back as a real card instead.
    const [a, b] = createPair(0)
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    expect(widget(a).size).toEqual(COLLAPSED_MEMBER_SIZE)

    const pasted = useWidgetStore.getState().pasteWidgets([widget(a), widget(b)])

    const state = useWidgetStore.getState()
    expect(pasted).toHaveLength(2)
    for (const id of pasted) {
      const w = state.widgets[id]!
      expect(state.widgetGlueIndex[id]).toBeUndefined()
      expect(w.iconified).toBe(false)
      expect(Math.min(w.size.width, w.size.height)).toBeGreaterThanOrEqual(ICON_MIN_EDGE)
    }
  })

  it('welds an external widget into a collapsed group — it joins, folds, and re-stacks', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    // A third widget, ungrouped and full-size, welded onto the folded block.
    const store = useWidgetStore.getState()
    const c = store.createWidget('Glue C', { x: 90_000, y: 90_000 }, 'notes')
    pin(c)
    useWidgetStore.getState().glueWidgets(c, a)

    const st = useWidgetStore.getState()
    const mergedId = st.widgetGlueIndex[c]!
    const glue = st.glues[mergedId]!
    // Still collapsed, now three, and the newcomer folded to a 1×1 icon.
    expect(glue.collapsed).toBe(true)
    expect(glue.widgetIds).toHaveLength(3)
    expect([a, b, c].every((id) => st.widgetGlueIndex[id] === mergedId)).toBe(true)
    expect(st.widgets[c]!.size).toEqual(COLLAPSED_MEMBER_SIZE)
    expect(st.widgets[c]!.iconified).toBe(true)
    // The newcomer remembers its pre-fold FULL size, so an unfold can bring it
    // back — not the 1×1 it is now folded to.
    expect(glue.restore?.[c]?.width).toBeGreaterThan(COLLAPSED_MEMBER_SIZE.width)

    // Unfolding returns EVERY member — including the one added while folded —
    // to a real card rather than leaving it a lone icon.
    useWidgetStore.getState().setClusterCollapsed(mergedId, false)
    const after = useWidgetStore.getState()
    for (const id of [a, b, c]) {
      expect(after.widgets[id]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
      expect(after.widgets[id]!.iconified).toBe(false)
    }
  })

  it('restores a member released from a collapsed group instead of leaving a 1×1 icon', () => {
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
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    // Pull one member out of the folded collection.
    useWidgetStore.getState().unglueWidget(c)
    const st = useWidgetStore.getState()
    // The released member is a real card again, not a sub-floor icon.
    expect(st.widgets[c]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
    expect(st.widgetGlueIndex[c]).toBeUndefined()
    // The two left behind stay a folded collection.
    const remainingId = st.widgetGlueIndex[a]!
    expect(st.glues[remainingId]!.collapsed).toBe(true)
    expect(st.widgets[a]!.size).toEqual(COLLAPSED_MEMBER_SIZE)
  })

  it('restores both members when ungluing dissolves a collapsed pair', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    useWidgetStore.getState().unglueWidget(b)
    const st = useWidgetStore.getState()
    expect(st.glues[glueId]).toBeUndefined()
    expect(st.widgets[a]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
    expect(st.widgets[b]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
  })

  it('restores every member when a collapsed group is ungrouped', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    useWidgetStore.getState().unglueCluster(glueId)
    const st = useWidgetStore.getState()
    expect(st.glues[glueId]).toBeUndefined()
    for (const id of [a, b]) {
      expect(st.widgets[id]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
      expect(st.widgetGlueIndex[id]).toBeUndefined()
    }
  })

  it('restores the survivor when deleting drops a collapsed pair below two', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().setClusterCollapsed(glueId, true)
    useWidgetStore.getState().deleteWidgets([b])
    const st = useWidgetStore.getState()
    expect(st.widgets[b]).toBeUndefined()
    expect(st.widgets[a]!.size).not.toEqual(COLLAPSED_MEMBER_SIZE)
    expect(st.widgetGlueIndex[a]).toBeUndefined()
  })

  it('carries a collapsed cluster and its restore map through a save/load round trip', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    const originalA = { ...widget(a).position }
    useWidgetStore.getState().setClusterCollapsed(glueId, true)

    const reloaded = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    useWidgetStore.getState().loadBoard(reloaded)
    const glue = useWidgetStore.getState().glues[glueId]!
    expect(glue.collapsed).toBe(true)
    expect(glue.restore?.[a]).toMatchObject({ x: originalA.x, y: originalA.y })

    // And it still unfolds correctly after the reload.
    useWidgetStore.getState().setClusterCollapsed(glueId, false)
    expect(useWidgetStore.getState().widgets[a]!.position).toEqual(originalA)
  })

  it('re-packs the cluster when a member is pinned open inside it', () => {
    // Two welded cards. Unpin the second so it sits as a compact resting tile,
    // then pin it back open: it grows to a full card straight through its
    // clustermate. The cluster has to give way around it.
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    useWidgetStore.getState().toggleWidgetPinned(b) // b now rests as a tile
    const tile = restingTileSize(widget(b))
    const anchor = { ...widget(b).position }
    // Weld a onto the tile's right edge: opening b must now push a along.
    place(a, anchor.x + tile.width, anchor.y)
    const before = { ...widget(a).position }
    expect(widget(b).size.width).toBeGreaterThan(tile.width)

    useWidgetStore.getState().toggleWidgetPinned(b) // held open again
    const pinned = widget(b)
    const neighbour = widget(a)
    expect(pinned.metadata.pinned).toBe(true)
    // The pinned card holds its ground — the cluster's own rigid grid snap can
    // still shift the whole block by less than a cell, but nothing shoves the
    // card that was just acted on...
    expect(Math.abs(pinned.position.x - anchor.x)).toBeLessThan(40)
    expect(Math.abs(pinned.position.y - anchor.y)).toBeLessThan(40)
    // ...its clustermate moved out of the way...
    expect(neighbour.position.x).toBeGreaterThan(before.x)
    // ...they are still welded (touching, so the seam re-carves itself)...
    expect(neighbour.position.x - (pinned.position.x + pinned.size.width)).toBe(0)
    // ...and they are still one cluster.
    expect(useWidgetStore.getState().widgetGlueIndex[a])
      .toBe(useWidgetStore.getState().widgetGlueIndex[b])
  })

  it('round-trips a cluster name through a snapshot', () => {
    const [a, b] = createPair()
    useWidgetStore.getState().glueWidgets(b, a)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a]!
    useWidgetStore.getState().renameGlue(glueId, 'Sprint board')
    const parsed = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!
    const glue = Object.values(parsed.glues).find((entry) => entry.widgetIds.includes(a))
    expect(glue?.name).toBe('Sprint board')
  })
})
