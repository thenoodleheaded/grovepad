import { create } from 'zustand'
import type { Vector2D, Widget } from '../types/spatial'
import {
  negotiateDisplacement,
  type NegotiationRect,
} from './spatialNegotiation'
import type { LayoutRect } from './widgetCollection'
import { useWidgetStore } from './useWidgetStore'
import { hierarchyBoundaryGuide, type HierarchyBoundaryGuide } from './hierarchyGuide'
import { usesStrictRelations } from '../utils/relationPolicy'

/**
 * Transient ghost layer for drag displacement. While a widget or cluster drag
 * is live, neighbors that must make room shift visually through the offsets
 * published here — their stored positions never change until the drop
 * commits. Cancelling a gesture therefore only clears this store and every
 * card glides home; nothing was ever written to the board.
 *
 * Ghost offsets are browser-session facts like live sizing measurements:
 * they must never reach undo history, persistence, or cloud sync, which is
 * why they live outside `useWidgetStore`.
 */

interface DragDisplacementState {
  /** Ghost offset per widget id. Entries parked at ZERO_OFFSET keep their
   *  displaced-transition styling so a retreating card glides home instead
   *  of teleporting when its push is withdrawn mid-drag. */
  offsets: Record<string, Vector2D>
  /** Widgets the gesture overlaps but that stayed put (locked, past the
   *  chain/area budget) — rendered dimmed as a "will settle on drop" hint. */
  pendingSettleIds: ReadonlySet<string>
  /** Temporary strict-hierarchy boundary ruler for the active drag. */
  hierarchyGuide: HierarchyBoundaryGuide | null
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const ZERO_OFFSET: Vector2D = { x: 0, y: 0 }

export const useDragDisplacementStore = create<DragDisplacementState>(() => ({
  offsets: {},
  pendingSettleIds: EMPTY_SET,
  hierarchyGuide: null,
}))

/** How long a meaningful overlap must persist before neighbors move. Long
 * enough that passing through a crowd or a brief hesitation never pushes —
 * only a held, deliberate overlap rearranges other cards. */
export const DISPLACEMENT_DWELL_MS = 300
/** Only rects this close to the drag take part in negotiation. */
const NEGOTIATION_RANGE = 1600

export interface NegotiationScene {
  /** The moving footprint. */
  active: LayoutRect
  /** One rigid rect per non-moving cluster near the drag. */
  clusters: NegotiationRect[]
  /** Cluster id → widget ids, for fanning a cluster offset out to cards. */
  members: Map<string, string[]>
}

/**
 * Collapse the board into the rect-level scene the negotiation engine
 * understands: moving widgets become one active rect, every nearby
 * non-moving widget joins its glue cluster's rigid rect, and clusters
 * containing a locked member are walls. Pure — exported for deterministic
 * tests.
 */
export function buildNegotiationScene(
  widgets: Record<string, Widget>,
  glues: Record<string, { widgetIds: string[] }>,
  glueIndex: Record<string, string>,
  movingIds: string[],
  range = NEGOTIATION_RANGE,
): NegotiationScene | null {
  const moving = movingIds.filter((id) => widgets[id])
  if (moving.length === 0) return null
  const canvasId = widgets[moving[0]!]!.canvasId
  const movingSet = new Set(moving)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of moving) {
    const w = widgets[id]!
    if (w.canvasId !== canvasId) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  if (!isFinite(minX)) return null
  const active: LayoutRect = {
    id: '__drag__',
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }

  const byCluster = new Map<string, string[]>()
  for (const id of Object.keys(widgets)) {
    const w = widgets[id]!
    if (w.canvasId !== canvasId || movingSet.has(id)) continue
    const gid = glueIndex[id]
    const key = gid && glues[gid] ? `g:${gid}` : `w:${id}`
    const list = byCluster.get(key)
    if (list) list.push(id)
    else byCluster.set(key, [id])
  }

  const nearMinX = active.x - range
  const nearMinY = active.y - range
  const nearMaxX = active.x + active.width + range
  const nearMaxY = active.y + active.height + range

  const clusters: NegotiationRect[] = []
  const members = new Map<string, string[]>()
  for (const [key, ids] of byCluster) {
    let cMinX = Infinity
    let cMinY = Infinity
    let cMaxX = -Infinity
    let cMaxY = -Infinity
    let locked = false
    for (const id of ids) {
      const w = widgets[id]!
      cMinX = Math.min(cMinX, w.position.x)
      cMinY = Math.min(cMinY, w.position.y)
      cMaxX = Math.max(cMaxX, w.position.x + w.size.width)
      cMaxY = Math.max(cMaxY, w.position.y + w.size.height)
      if (w.metadata.locked) locked = true
    }
    const rect: NegotiationRect = {
      id: key,
      x: cMinX,
      y: cMinY,
      width: cMaxX - cMinX,
      height: cMaxY - cMinY,
    }
    if (locked) rect.locked = true
    if (rect.x + rect.width < nearMinX || rect.x > nearMaxX) continue
    if (rect.y + rect.height < nearMinY || rect.y > nearMaxY) continue
    clusters.push(rect)
    members.set(key, ids)
  }
  return { active, clusters, members }
}

interface GestureTracker {
  directionX: number
  directionY: number
  dwellStart: number | null
  displacing: boolean
  suppressed: boolean
}

let tracker: GestureTracker | null = null

/** Arm displacement for a new drag gesture. */
export function beginDragDisplacement(): void {
  tracker = { directionX: 0, directionY: 0, dwellStart: null, displacing: false, suppressed: false }
  useDragDisplacementStore.setState({ hierarchyGuide: null })
}

/**
 * Glue intent wins over displacement: while an option-drag is about to weld
 * onto a target nothing may be pushed. Ghosts glide home and the dwell gate
 * re-arms.
 */
export function setDragDisplacementSuppressed(suppressed: boolean): void {
  if (!tracker || tracker.suppressed === suppressed) return
  tracker.suppressed = suppressed
  if (suppressed) {
    tracker.dwellStart = null
    tracker.displacing = false
    withdrawGhosts()
  }
}

/** Park every live ghost at zero (they animate home) and clear the dim hints. */
function withdrawGhosts(): void {
  const state = useDragDisplacementStore.getState()
  const ids = Object.keys(state.offsets)
  if (ids.length === 0 && state.pendingSettleIds.size === 0) return
  const offsets: Record<string, Vector2D> = {}
  for (const id of ids) offsets[id] = ZERO_OFFSET
  useDragDisplacementStore.setState({ offsets, pendingSettleIds: EMPTY_SET })
}

export interface DisplacementGestureOptions {
  /** Geometric intent-gate override. Drags keep the meaningful-coverage
   *  default; resize passes 0 because growing an edge is already explicit. */
  minOverlapRatio?: number
  /** Dwell override; resize responds immediately. */
  dwellMs?: number
}

/**
 * Negotiate this frame of the gesture. Called from the frame-batched delta
 * callback after the store move/resize applied; `movingIds` mirrors exactly
 * the set the store action changed. `now` is injectable for tests.
 */
export function updateDragDisplacement(
  movingIds: string[],
  worldDelta: Vector2D,
  now: number = performance.now(),
  gestureOptions?: DisplacementGestureOptions,
): void {
  if (!tracker) return
  // Exponentially smoothed drag direction so a one-frame jitter cannot flip
  // which way rooms open.
  tracker.directionX = tracker.directionX * 0.6 + worldDelta.x * 0.4
  tracker.directionY = tracker.directionY * 0.6 + worldDelta.y * 0.4
  if (tracker.suppressed) return

  const state = useWidgetStore.getState()
  const movingCanvasId = state.widgets[movingIds[0] ?? '']?.canvasId
  const nextGuide = usesStrictRelations(state.canvases[movingCanvasId ?? state.activeCanvasId])
    ? hierarchyBoundaryGuide(state.widgets, state.relations, movingIds)
    : null
  const currentGuide = useDragDisplacementStore.getState().hierarchyGuide
  if (
    currentGuide?.childId !== nextGuide?.childId ||
    currentGuide?.guardianId !== nextGuide?.guardianId ||
    currentGuide?.x1 !== nextGuide?.x1 ||
    currentGuide?.x2 !== nextGuide?.x2 ||
    currentGuide?.y !== nextGuide?.y
  ) {
    useDragDisplacementStore.setState({ hierarchyGuide: nextGuide })
  }
  const scene = buildNegotiationScene(
    state.widgets,
    state.glues,
    state.widgetGlueIndex,
    movingIds,
  )
  if (!scene) {
    tracker.dwellStart = null
    tracker.displacing = false
    withdrawGhosts()
    return
  }

  const result = negotiateDisplacement(
    scene.active,
    { x: tracker.directionX, y: tracker.directionY },
    scene.clusters,
    gestureOptions?.minOverlapRatio === undefined
      ? undefined
      : { minOverlapRatio: gestureOptions.minOverlapRatio },
  )
  const hasWork = Object.keys(result.offsets).length > 0 || result.overflowIds.length > 0
  if (!hasWork) {
    tracker.dwellStart = null
    tracker.displacing = false
    withdrawGhosts()
    return
  }

  // Intent gate, timing half: meaningful overlap must persist through the
  // dwell window before anything moves — passing over a crowd leaves no wake.
  const dwellMs = gestureOptions?.dwellMs ?? DISPLACEMENT_DWELL_MS
  if (!tracker.displacing) {
    if (tracker.dwellStart === null) {
      tracker.dwellStart = now
      if (dwellMs > 0) return
    }
    if (now - tracker.dwellStart < dwellMs) return
    tracker.displacing = true
  }

  publish(result.offsets, result.overflowIds, scene)
}

function publish(
  clusterOffsets: Record<string, Vector2D>,
  overflowClusterIds: string[],
  scene: NegotiationScene,
): void {
  const previous = useDragDisplacementStore.getState()
  const offsets: Record<string, Vector2D> = {}
  let changed = false

  for (const [clusterId, offset] of Object.entries(clusterOffsets)) {
    const ids = scene.members.get(clusterId)
    if (!ids || ids.length === 0) continue
    // One shared Vector2D per cluster, and the previous frame's reference is
    // reused when the value is unchanged — cards only re-render on real moves.
    const prior = previous.offsets[ids[0]!]
    const shared = prior && prior.x === offset.x && prior.y === offset.y ? prior : offset
    for (const id of ids) {
      offsets[id] = shared
      if (previous.offsets[id] !== shared) changed = true
    }
  }
  // Withdrawn pushes park at zero so the retreat animates under the same
  // displaced styling; entries only disappear entirely when the drag ends.
  for (const id of Object.keys(previous.offsets)) {
    if (offsets[id]) continue
    offsets[id] = ZERO_OFFSET
    if (previous.offsets[id] !== ZERO_OFFSET) changed = true
  }
  if (Object.keys(offsets).length !== Object.keys(previous.offsets).length) changed = true

  let pendingSettleIds = previous.pendingSettleIds
  const nextPending = new Set<string>()
  for (const clusterId of overflowClusterIds) {
    for (const id of scene.members.get(clusterId) ?? []) nextPending.add(id)
  }
  if (
    nextPending.size !== previous.pendingSettleIds.size ||
    [...nextPending].some((id) => !previous.pendingSettleIds.has(id))
  ) {
    pendingSettleIds = nextPending
    changed = true
  }

  if (changed) useDragDisplacementStore.setState({ offsets, pendingSettleIds })
}

/**
 * End the gesture and hand back the non-zero offsets for the drop commit.
 * The caller applies them to the board (inside the gesture's single history
 * step) before running the release settle.
 */
export function endDragDisplacement(): Record<string, Vector2D> {
  tracker = null
  const state = useDragDisplacementStore.getState()
  const commit: Record<string, Vector2D> = {}
  for (const [id, offset] of Object.entries(state.offsets)) {
    if (offset.x !== 0 || offset.y !== 0) commit[id] = offset
  }
  if (Object.keys(state.offsets).length > 0 || state.pendingSettleIds.size > 0) {
    useDragDisplacementStore.setState({ offsets: {}, pendingSettleIds: EMPTY_SET, hierarchyGuide: null })
  } else if (state.hierarchyGuide) {
    useDragDisplacementStore.setState({ hierarchyGuide: null })
  }
  return commit
}

/** Drop every ghost without committing anything (cancelled/aborted gesture). */
export function cancelDragDisplacement(): void {
  tracker = null
  const state = useDragDisplacementStore.getState()
  if (Object.keys(state.offsets).length > 0 || state.pendingSettleIds.size > 0) {
    useDragDisplacementStore.setState({ offsets: {}, pendingSettleIds: EMPTY_SET, hierarchyGuide: null })
  } else if (state.hierarchyGuide) {
    useDragDisplacementStore.setState({ hierarchyGuide: null })
  }
}
