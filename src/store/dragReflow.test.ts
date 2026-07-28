import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import {
  REFLOW_ENGAGE_MS,
  beginDragReflow,
  buildLane,
  buildReflowBaseline,
  cancelDragReflow,
  claimIndex,
  endDragReflow,
  laneShifts,
  updateDragReflow,
  useDragReflowStore,
} from './dragReflow'
import { useWidgetStore } from './useWidgetStore'
import { restingFootprintWidget } from '../utils/widgetRest'
import { GRID_SIZE } from '../types/spatial'
import { LAYOUT_GAP } from './widgetLayoutConstants'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  cancelDragReflow()
  useWidgetStore.getState().loadBoard(baseline)
})

function createNotes(count: number): string[] {
  const store = useWidgetStore.getState()
  return Array.from({ length: count }, (_, index) =>
    store.createWidget(`Reflow test ${index + 1}`, { x: 20_000 + index * 1_200, y: 20_000 }, 'notes'),
  )
}

/** Test-only teleport: position widgets exactly, bypassing collision logic. */
function place(id: string, x: number, y: number, locked = false): void {
  const state = useWidgetStore.getState()
  const widget = state.widgets[id]!
  useWidgetStore.setState({
    widgets: {
      ...state.widgets,
      [id]: {
        ...widget,
        position: { x, y },
        metadata: { ...widget.metadata, locked },
      },
    },
  })
}

function widget(id: string) {
  return useWidgetStore.getState().widgets[id]!
}

/** The box the reflow actually measures: the resting tile, not the stored
 * full-card size (an empty note rests as its 80px icon cell). */
function tile(id: string) {
  return restingFootprintWidget(widget(id)).size
}

const RIGHT = { x: 40, y: 0 }
const AFTER_ENGAGE = REFLOW_ENGAGE_MS + 50

function freshBaseline(movingIds: string[]) {
  const state = useWidgetStore.getState()
  return buildReflowBaseline(state.widgets, state.glues, state.widgetGlueIndex, movingIds)!
}

/** Overlap `b` halfway onto `a` from the right — 50% coverage, above the gate. */
function overlapPair(): [string, string] {
  const [a, b] = createNotes(2)
  const base = widget(a!)
  place(b!, base.position.x + Math.round(tile(a!).width / 2 / GRID_SIZE) * GRID_SIZE, base.position.y)
  return [a!, b!]
}

/** Drive a full engaged gesture and read the published offsets. */
function runGesture(movingIds: string[], delta = RIGHT) {
  beginDragReflow()
  updateDragReflow(movingIds, delta, 0)
  updateDragReflow(movingIds, delta, AFTER_ENGAGE)
  return useDragReflowStore.getState()
}

const rect = (x: number, y: number, width: number, height: number, id = 'r') => ({
  id,
  x,
  y,
  width,
  height,
  locked: false,
  ids: [id],
})

describe('lane geometry', () => {
  it('takes only the cards standing in the drag band, in axis order, never locked ones', () => {
    const active = rect(0, 0, 100, 100, '__drag__')
    const inLane = rect(400, 20, 100, 100, 'near')
    const besideLane = rect(400, 400, 100, 100, 'far')
    const wall = rect(800, 0, 100, 100, 'wall')
    wall.locked = true
    const behind = rect(-400, 0, 100, 100, 'behind')

    const lane = buildLane([wall, inLane, besideLane, behind], active, 'x')
    expect(lane.map((r) => r.id)).toEqual(['behind', 'near'])
  })

  it('claims a slot only once the drag is decisively past a card centre', () => {
    const lane = [rect(0, 0, 100, 100, 'a'), rect(400, 0, 100, 100, 'b')]
    // Sitting just past a's centre is not enough to give up slot 0.
    const barelyPast = rect(20, 0, 100, 100)
    expect(claimIndex(lane, barelyPast, 'x', 0)).toBe(0)
    // A clear commitment past it does claim the next slot...
    const wellPast = rect(120, 0, 100, 100)
    expect(claimIndex(lane, wellPast, 'x', 0)).toBe(1)
    // ...and coming barely back does not give it up again.
    expect(claimIndex(lane, barelyPast, 'x', 1)).toBe(1)
    // With no prior claim the split is read straight off the geometry.
    expect(claimIndex(lane, barelyPast, 'x', null)).toBe(1)
  })

  it('opens the lane around the drag and stops at the first card that had room', () => {
    // Three cards in a row, the last one already standing well clear.
    const lane = [
      rect(0, 0, 100, 100, 'a'),
      rect(200, 0, 100, 100, 'b'),
      rect(2_000, 0, 100, 100, 'c'),
    ]
    // The drag lands across the a/b seam, ordered after a.
    const active = rect(90, 0, 100, 100, '__drag__')
    const shifts = laneShifts(lane, 1, active, 'x')

    expect(shifts[0]).toBeLessThan(0) // a gives way backwards
    expect(shifts[1]).toBeGreaterThan(0) // b gives way forwards
    expect(shifts[2]).toBe(0) // c already had the room; the run stops
    expect(shifts.every((s) => s % GRID_SIZE === 0)).toBe(true)

    // The cards that moved actually clear the drag by the layout gap.
    expect(lane[0]!.x + lane[0]!.width + shifts[0]!).toBeLessThanOrEqual(active.x - LAYOUT_GAP)
    expect(lane[1]!.x + shifts[1]!).toBeGreaterThanOrEqual(active.x + active.width + LAYOUT_GAP)
  })

  it('is a pure function of the baseline: the same claim always gives the same layout', () => {
    const lane = [rect(0, 0, 100, 100, 'a'), rect(200, 0, 100, 100, 'b')]
    const active = rect(90, 0, 100, 100, '__drag__')
    const once = laneShifts(lane, 1, active, 'x')
    // Recomputing a hundred times is not a hundred nudges — nothing accumulates.
    let again = once
    for (let i = 0; i < 100; i++) again = laneShifts(lane, 1, active, 'x')
    expect(again).toEqual(once)
    // And withdrawing the claim restores the baseline exactly, with no repair.
    expect(laneShifts(lane, 2, rect(4_000, 0, 100, 100, '__drag__'), 'x')).toEqual([0, 0])
  })
})

describe('reflow baseline', () => {
  it('excludes moving widgets and collapses a glue cluster into one rigid rect', () => {
    const [mover, a, b] = createNotes(3)
    const first = widget(a!)
    place(b!, first.position.x + tile(a!).width + 12, first.position.y)
    useWidgetStore.getState().glueWidgets(b!, a!)
    const glueId = useWidgetStore.getState().widgetGlueIndex[a!]!

    const snapshot = freshBaseline([mover!])
    expect(snapshot.active.width).toBe(tile(mover!).width)
    const cluster = snapshot.neighbours.find((r) => r.id === `g:${glueId}`)!
    expect(cluster).toBeDefined()
    expect(cluster.ids.slice().sort()).toEqual([a, b].sort())
    expect(snapshot.neighbours.some((r) => r.id === `w:${mover}`)).toBe(false)
  })

  it('marks clusters holding a locked member and drops far-away rects', () => {
    const [mover, near, far] = createNotes(3)
    const base = widget(mover!)
    place(near!, base.position.x + 400, base.position.y, true)
    place(far!, base.position.x + 40_000, base.position.y)

    const snapshot = freshBaseline([mover!])
    expect(snapshot.neighbours.find((r) => r.id === `w:${near}`)!.locked).toBe(true)
    expect(snapshot.neighbours.some((r) => r.id === `w:${far}`)).toBe(false)
  })
})

describe('drag reflow driver', () => {
  it('publishes nothing until meaningful overlap has held', () => {
    const [a, b] = overlapPair()
    beginDragReflow()
    updateDragReflow([a], RIGHT, 0)
    expect(useDragReflowStore.getState().offsets).toEqual({})
    updateDragReflow([a], RIGHT, REFLOW_ENGAGE_MS - 20)
    expect(useDragReflowStore.getState().offsets).toEqual({})
    updateDragReflow([a], RIGHT, AFTER_ENGAGE)
    const offset = useDragReflowStore.getState().offsets[b]!
    expect(offset).toBeDefined()
    expect(offset.x).toBeGreaterThan(0)
    expect(offset.x % GRID_SIZE).toBe(0)
    expect(offset.y).toBe(0)
  })

  it('reports an overlapped locked widget as pending settle, never as an offset', () => {
    const [a, b] = overlapPair()
    place(b, widget(b).position.x, widget(b).position.y, true)
    const state = runGesture([a])
    expect(state.offsets).toEqual({})
    expect(state.pendingSettleIds.has(b)).toBe(true)
    expect(endDragReflow()).toEqual({})
  })

  it('end returns only non-zero offsets and clears the store; cancel commits nothing', () => {
    const [a, b] = overlapPair()
    runGesture([a])
    const commit = endDragReflow()
    expect(Object.keys(commit)).toEqual([b])
    expect(commit[b]!.x).toBeGreaterThan(0)
    expect(useDragReflowStore.getState().offsets).toEqual({})
    expect(useDragReflowStore.getState().pendingSettleIds.size).toBe(0)

    runGesture([a])
    cancelDragReflow()
    expect(useDragReflowStore.getState().offsets).toEqual({})
    // A fresh gesture never sees stale tracker state.
    updateDragReflow([a], RIGHT, AFTER_ENGAGE * 2)
    expect(useDragReflowStore.getState().offsets).toEqual({})
  })

  it('holds one lane axis through a wobbly diagonal drag', () => {
    const [a, b] = overlapPair()
    beginDragReflow()
    let now = 0
    const axes = new Set<string>()
    for (let frame = 0; frame < 30; frame++) {
      const delta = frame % 2 === 0 ? { x: 9, y: 6 } : { x: 6, y: 9 }
      now += 40
      updateDragReflow([a], delta, now)
      const offset = useDragReflowStore.getState().offsets[b]
      if (!offset || (offset.x === 0 && offset.y === 0)) continue
      axes.add(offset.x !== 0 ? 'x' : 'y')
    }
    expect(axes.size).toBe(1)

    // A decisive turn still switches the lane rather than pinning the first axis.
    for (let frame = 0; frame < 30; frame++) {
      now += 40
      updateDragReflow([a], { x: 0, y: 12 }, now)
    }
    const offset = useDragReflowStore.getState().offsets[b]!
    expect(offset.x).toBe(0)
    expect(offset.y).toBeGreaterThan(0)
  })

  it('takes the whole lane back to baseline when the drag leaves, with nothing left over', () => {
    const [a, b] = overlapPair()
    const started = widget(b).position
    runGesture([a])
    expect(useDragReflowStore.getState().offsets[b]!.x).toBeGreaterThan(0)

    // Carry the dragged card far clear of everything and keep driving frames.
    let now = AFTER_ENGAGE
    for (let frame = 0; frame < 20; frame++) {
      const w = widget(a)
      place(a, w.position.x + 400, w.position.y)
      now += 40
      updateDragReflow([a], RIGHT, now)
    }
    // Every ghost is parked at exact zero — the recomputed layout IS the
    // baseline again, so a drop here commits nothing.
    for (const offset of Object.values(useDragReflowStore.getState().offsets)) {
      expect(offset).toEqual({ x: 0, y: 0 })
    }
    expect(endDragReflow()).toEqual({})
    expect(widget(b).position).toEqual(started)
  })

  it('a card the lane never spoke for is dimmed, not moved', () => {
    // All three exist before anything is positioned: creating a widget on top
    // of the fixture would settle the fixture out from under it.
    const [a, b, c] = createNotes(3)
    const base = widget(a!)
    // `b` sits half-sunk in the lane and is what engages the gesture.
    place(b!, base.position.x + Math.round(tile(a!).width / 2 / GRID_SIZE) * GRID_SIZE, base.position.y)
    // `c` clips the drag's box but shares almost none of its horizontal band:
    // beside the lane, not in it. Measured off the real rects rather than
    // guessed, because a card's box carries its floating title row on top.
    place(c!, base.position.x, base.position.y)
    const probe = freshBaseline([a!])
    const cRect = probe.neighbours.find((r) => r.id === `w:${c}`)!
    const head = widget(c!).position.y - cRect.y
    place(c!, probe.active.x, probe.active.y + probe.active.height - 4 + head)

    const state = runGesture([a!])
    expect(state.offsets[b!]!.x).toBeGreaterThan(0)
    expect(state.offsets[c!]).toBeUndefined()
    expect(state.pendingSettleIds.has(c!)).toBe(true)
  })

  it('applyGhostDisplacement moves widgets by their offsets, skipping locked ones', () => {
    const [a, b] = createNotes(2)
    const beforeA = widget(a!).position
    const beforeB = widget(b!).position
    place(b!, beforeB.x, beforeB.y, true)
    useWidgetStore.getState().applyGhostDisplacement({
      [a!]: { x: 80, y: -40 },
      [b!]: { x: 80, y: 0 },
    })
    expect(widget(a!).position).toEqual({ x: beforeA.x + 80, y: beforeA.y - 40 })
    expect(widget(b!).position).toEqual({ x: beforeB.x, y: beforeB.y })
  })
})
