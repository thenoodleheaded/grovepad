import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { GROUP_PAD } from '../utils/groupGeometry'
import {
  DISPLACEMENT_DWELL_MS,
  beginDragDisplacement,
  buildNegotiationScene,
  cancelDragDisplacement,
  endDragDisplacement,
  setDragDisplacementSuppressed,
  updateDragDisplacement,
  useDragDisplacementStore,
} from './dragDisplacement'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  cancelDragDisplacement()
  useWidgetStore.getState().loadBoard(baseline)
})

function createNotes(count: number): string[] {
  const store = useWidgetStore.getState()
  return Array.from({ length: count }, (_, index) =>
    store.createWidget(`Displacement test ${index + 1}`, { x: 20_000 + index * 1_200, y: 20_000 }, 'notes'),
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

const RIGHT = { x: 40, y: 0 }
const AFTER_DWELL = DISPLACEMENT_DWELL_MS + 50

/** Overlap `b` halfway onto `a` from the right — 50% coverage, above the gate. */
function overlapPair(): [string, string] {
  const [a, b] = createNotes(2)
  const base = widget(a!)
  place(b!, base.position.x + Math.round(base.size.width / 2 / 40) * 40, base.position.y)
  return [a!, b!]
}

describe('buildNegotiationScene', () => {
  it('excludes moving widgets and collapses a group into one padded rigid cluster', () => {
    const [mover, a, b] = createNotes(3)
    const state = useWidgetStore.getState()
    const groupId = state.createGroup([a!, b!], 'Cluster')
    const fresh = useWidgetStore.getState()

    const scene = buildNegotiationScene(fresh.widgets, fresh.groups, fresh.widgetGroupIndex, [mover!])!
    expect(scene.active.width).toBe(widget(mover!).size.width)
    const cluster = scene.clusters.find((rect) => rect.id === `g:${groupId}`)!
    expect(cluster).toBeDefined()
    expect(scene.clusters.some((rect) => rect.id === `w:${mover}`)).toBe(false)
    expect(scene.members.get(`g:${groupId}`)?.sort()).toEqual([a, b].sort())
    const memberMinX = Math.min(widget(a!).position.x, widget(b!).position.x)
    expect(cluster.x).toBe(memberMinX - GROUP_PAD)
  })

  it('marks clusters containing a locked member as walls and drops far-away rects', () => {
    const [mover, near, far] = createNotes(3)
    const base = widget(mover!)
    place(near!, base.position.x + 400, base.position.y, true)
    place(far!, base.position.x + 40_000, base.position.y)
    const fresh = useWidgetStore.getState()

    const scene = buildNegotiationScene(fresh.widgets, fresh.groups, fresh.widgetGroupIndex, [mover!])!
    const nearCluster = scene.clusters.find((rect) => rect.id === `w:${near}`)!
    expect(nearCluster.locked).toBe(true)
    expect(scene.clusters.some((rect) => rect.id === `w:${far}`)).toBe(false)
  })
})

describe('drag displacement driver', () => {
  it('publishes nothing until meaningful overlap has dwelled', () => {
    const [a] = overlapPair()
    beginDragDisplacement()
    updateDragDisplacement([a], RIGHT, 0)
    expect(useDragDisplacementStore.getState().offsets).toEqual({})
    updateDragDisplacement([a], RIGHT, DISPLACEMENT_DWELL_MS - 50)
    expect(useDragDisplacementStore.getState().offsets).toEqual({})
    updateDragDisplacement([a], RIGHT, AFTER_DWELL)
    const offsets = useDragDisplacementStore.getState().offsets
    const [b] = Object.keys(offsets)
    expect(b).toBeDefined()
    expect(offsets[b!]!.x).toBeGreaterThan(0)
    expect(offsets[b!]!.x % 40).toBe(0)
    expect(offsets[b!]!.y).toBe(0)
  })

  it('reports an overlapped locked widget as pending settle, never as an offset', () => {
    const [a, b] = overlapPair()
    place(b, widget(b).position.x, widget(b).position.y, true)
    beginDragDisplacement()
    updateDragDisplacement([a], RIGHT, 0)
    updateDragDisplacement([a], RIGHT, AFTER_DWELL)
    const state = useDragDisplacementStore.getState()
    expect(state.offsets).toEqual({})
    expect(state.pendingSettleIds.has(b)).toBe(true)
    expect(endDragDisplacement()).toEqual({})
  })

  it('suppression parks ghosts at zero and re-arms the dwell gate', () => {
    const [a, b] = overlapPair()
    beginDragDisplacement()
    updateDragDisplacement([a], RIGHT, 0)
    updateDragDisplacement([a], RIGHT, AFTER_DWELL)
    expect(useDragDisplacementStore.getState().offsets[b]!.x).toBeGreaterThan(0)

    setDragDisplacementSuppressed(true)
    const parked = useDragDisplacementStore.getState()
    expect(parked.offsets[b]).toEqual({ x: 0, y: 0 })
    expect(parked.pendingSettleIds.size).toBe(0)

    setDragDisplacementSuppressed(false)
    updateDragDisplacement([a], RIGHT, AFTER_DWELL + 10)
    expect(useDragDisplacementStore.getState().offsets[b]).toEqual({ x: 0, y: 0 })
    updateDragDisplacement([a], RIGHT, AFTER_DWELL + 10 + AFTER_DWELL)
    expect(useDragDisplacementStore.getState().offsets[b]!.x).toBeGreaterThan(0)
  })

  it('end returns only non-zero offsets and clears the store; cancel commits nothing', () => {
    const [a, b] = overlapPair()
    beginDragDisplacement()
    updateDragDisplacement([a], RIGHT, 0)
    updateDragDisplacement([a], RIGHT, AFTER_DWELL)
    const commit = endDragDisplacement()
    expect(Object.keys(commit)).toEqual([b])
    expect(commit[b]!.x).toBeGreaterThan(0)
    expect(useDragDisplacementStore.getState().offsets).toEqual({})
    expect(useDragDisplacementStore.getState().pendingSettleIds.size).toBe(0)

    beginDragDisplacement()
    updateDragDisplacement([a], RIGHT, 0)
    updateDragDisplacement([a], RIGHT, AFTER_DWELL)
    cancelDragDisplacement()
    expect(useDragDisplacementStore.getState().offsets).toEqual({})
    // A fresh gesture never sees stale tracker state.
    updateDragDisplacement([a], RIGHT, AFTER_DWELL * 2)
    expect(useDragDisplacementStore.getState().offsets).toEqual({})
  })

  it('resize-mode options displace on first contact with no dwell', () => {
    const [a, b] = createNotes(2)
    const base = widget(a!)
    // A sliver of contact — far below the drag coverage gate.
    place(b!, base.position.x + base.size.width - 40, base.position.y)
    beginDragDisplacement()
    updateDragDisplacement([a!], { x: 12, y: 0 }, 0, { minOverlapRatio: 0, dwellMs: 0 })
    const offsets = useDragDisplacementStore.getState().offsets
    expect(offsets[b!]).toBeDefined()
    expect(offsets[b!]!.x).toBeGreaterThan(0)
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
