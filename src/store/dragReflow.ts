import { create } from 'zustand'
import { GRID_SIZE, snapToGrid, type Vector2D, type Widget } from '../types/spatial'
import { GLUE_FRAME_BAND, GLUE_TITLE_HEADROOM } from '../utils/glueGeometry'
import { restingFootprintWidget, WIDGET_TITLE_ROW, widgetShowsTitleRow } from '../utils/widgetRest'
import { LAYOUT_GAP } from './widgetLayoutConstants'
import type { LayoutRect } from './widgetCollection'
import { useWidgetStore } from './useWidgetStore'

/**
 * Drag reflow: how the board makes room for a card you are dragging.
 *
 * The law here is that **nothing is ever pushed**. Neighbours do not react to
 * being touched and they do not accumulate nudges. Instead the cards the drag
 * contends with form an ORDERED LANE, the drag claims an INDEX in that lane,
 * and every neighbour's ghost position is recomputed from scratch, every
 * frame, as a pure function of (baseline arrangement, claimed index, dragged
 * rect). Nobody's offset is ever derived from their own previous offset.
 *
 * Three properties fall out of that, and they are the whole point:
 *
 * - **Exact reversal.** Withdraw the drag and the claimed index goes away, so
 *   the recomputed layout IS the baseline again — to the pixel. There is no
 *   repair pass, because there is no drift to repair.
 * - **No cascade budget.** A shift stops at the first neighbour that already
 *   had room for it; nothing needs a chain depth or an area cap to stay
 *   bounded, because the run is computed in one forward pass, not by knocking
 *   on doors.
 * - **Interruptible motion.** Cards glide toward their recomputed slot on the
 *   layout transition; retargeting mid-flight picks up from wherever they are.
 *
 * Ghost offsets are browser-session facts like live sizing measurements: they
 * must never reach undo history, persistence, or cloud sync, which is why they
 * live outside `useWidgetStore`. Stored positions change exactly once, at the
 * drop, when `endDragReflow`'s offsets are committed.
 */

interface DragReflowState {
  /** Ghost offset per widget id. Entries parked at ZERO_OFFSET keep their
   *  displaced-transition styling so a card whose slot went back to baseline
   *  glides home instead of teleporting mid-drag. */
  offsets: Record<string, Vector2D>
  /** Widgets the drag covers that the lane cannot answer for — locked cards
   *  and cards standing outside the lane's band — rendered dimmed as a
   *  "will settle on drop" hint. */
  pendingSettleIds: ReadonlySet<string>
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const ZERO_OFFSET: Vector2D = { x: 0, y: 0 }

export const useDragReflowStore = create<DragReflowState>(() => ({
  offsets: {},
  pendingSettleIds: EMPTY_SET,
}))

/**
 * How long a meaningful overlap must persist before the lane opens. Short,
 * because the reflow is exactly reversible: a claim that turns out to be a
 * pass-through costs nothing to withdraw. The old push engine needed 300ms of
 * hesitation as damage control — it committed real displacement on drop and
 * could not take a push back cleanly. This one only needs enough to tell
 * "flying past" from "arriving".
 */
export const REFLOW_ENGAGE_MS = 120

/** Only neighbours this close to the drag are measured at all. Purely a scan
 *  bound: the lane's own run-stopping rule is what limits how far a shift
 *  travels. */
const REFLOW_SCAN_RANGE = 1600

/**
 * How decisively the perpendicular component must win before the lane axis
 * switches. On a diagonal drag |dx| ≈ |dy|, so without hysteresis the dominant
 * axis flips on every wobble — and each flip rebuilds the lane along the other
 * axis, moving every neighbour between two parking spots cells apart.
 */
const AXIS_SWITCH_RATIO = 1.5

/**
 * How far past a neighbour's centre the drag must travel before it claims the
 * slot on the far side of it, and how far back before it gives the slot up.
 * This is the anti-flicker gate: a drag parked exactly on a boundary would
 * otherwise re-split the lane on two pixels of hand jitter.
 */
const INDEX_HYSTERESIS = GRID_SIZE

/** Perpendicular coverage a neighbour needs before it counts as standing in
 *  the drag's lane rather than merely beside it. */
const LANE_BAND_RATIO = 0.25

/** Overlap that reads as intent rather than as passing over. Either party
 *  counts, so a small card sunk into a big one engages. */
const ENGAGE_COVERAGE_RATIO = 1 / 3

type Axis = 'x' | 'y'

interface LaneRect extends LayoutRect {
  locked: boolean
  /** Widget ids this rect stands for — a glue cluster is one rect. */
  ids: string[]
}

export interface ReflowBaseline {
  /** The moving set this baseline was built for. */
  movingKey: string
  /** One rigid rect per non-moving cluster near the drag, at its pre-gesture
   *  position. Neighbour positions are never written during a gesture, so this
   *  stays the truth for the whole drag. */
  neighbours: LaneRect[]
  /** The moving footprint's own size, and its pre-gesture corner. */
  active: LayoutRect
  /** Whether the moving set is a whole glue cluster, so the live re-measure
   *  each frame reserves the same group frame the baseline did. */
  activeIsCluster: boolean
}

/**
 * Measure one cluster exactly the way the release settle measures it
 * (`settleWidgetLayout`'s `rectFor`): the resting tile rather than the dormant
 * full-card size, plus the floating title row when one is shown, plus the
 * group frame band for a real cluster. Preview and drop must agree, or the
 * cards fly once on the reflow and a second time on the settle.
 */
function measureCluster(widgets: Record<string, Widget>, ids: string[], isCluster: boolean): LayoutRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of ids) {
    const widget = widgets[id]!
    const footprint = restingFootprintWidget(widget)
    const head = widgetShowsTitleRow(widget, { glued: isCluster }) ? WIDGET_TITLE_ROW : 0
    minX = Math.min(minX, widget.position.x)
    minY = Math.min(minY, widget.position.y - head)
    maxX = Math.max(maxX, widget.position.x + footprint.size.width)
    maxY = Math.max(maxY, widget.position.y + footprint.size.height)
  }
  if (isCluster) {
    minX -= GLUE_FRAME_BAND
    maxX += GLUE_FRAME_BAND
    minY -= GLUE_TITLE_HEADROOM
    maxY += GLUE_FRAME_BAND
  }
  return { id: '', x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Snapshot the board into the rect-level baseline the reflow reasons over:
 * the moving widgets become one active rect, and every nearby non-moving
 * widget joins its glue cluster's rigid rect. Pure — exported for tests.
 */
export function buildReflowBaseline(
  widgets: Record<string, Widget>,
  glues: Record<string, { widgetIds: string[] }>,
  glueIndex: Record<string, string>,
  movingIds: string[],
  range = REFLOW_SCAN_RANGE,
): ReflowBaseline | null {
  const moving = movingIds.filter((id) => widgets[id])
  if (moving.length === 0) return null
  const canvasId = widgets[moving[0]!]!.canvasId
  const onCanvas = moving.filter((id) => widgets[id]!.canvasId === canvasId)
  if (onCanvas.length === 0) return null
  const movingSet = new Set(onCanvas)

  const activeIsCluster = onCanvas.length > 1 && onCanvas.every((id) => Boolean(glueIndex[id]))
  const active = measureCluster(widgets, onCanvas, activeIsCluster)
  active.id = '__drag__'

  const byCluster = new Map<string, string[]>()
  for (const id of Object.keys(widgets)) {
    const widget = widgets[id]!
    if (widget.canvasId !== canvasId || movingSet.has(id)) continue
    const gid = glueIndex[id]
    const key = gid && glues[gid] ? `g:${gid}` : `w:${id}`
    const list = byCluster.get(key)
    if (list) list.push(id)
    else byCluster.set(key, [id])
  }

  const neighbours: LaneRect[] = []
  for (const [key, ids] of byCluster) {
    const rect = measureCluster(widgets, ids, key.startsWith('g:') && ids.length > 1)
    if (rect.x + rect.width < active.x - range || rect.x > active.x + active.width + range) continue
    if (rect.y + rect.height < active.y - range || rect.y > active.y + active.height + range) continue
    neighbours.push({
      ...rect,
      id: key,
      locked: ids.some((id) => widgets[id]!.metadata.locked === true),
      ids,
    })
  }
  neighbours.sort((a, b) => (a.id < b.id ? -1 : 1))
  return { movingKey: onCanvas.slice().sort().join('|'), neighbours, active, activeIsCluster }
}

const start = (rect: LayoutRect, axis: Axis): number => (axis === 'x' ? rect.x : rect.y)
const span = (rect: LayoutRect, axis: Axis): number => (axis === 'x' ? rect.width : rect.height)
const end = (rect: LayoutRect, axis: Axis): number => start(rect, axis) + span(rect, axis)
const middle = (rect: LayoutRect, axis: Axis): number => start(rect, axis) + span(rect, axis) / 2
const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x')

/** Whole grid cells, rounded up — every ghost slot lands on the board grid. */
function quantize(distance: number): number {
  return distance > 0 ? Math.ceil(distance / GRID_SIZE) * GRID_SIZE : 0
}

function overlapAlong(a: LayoutRect, b: LayoutRect, axis: Axis): number {
  return Math.min(end(a, axis), end(b, axis)) - Math.max(start(a, axis), start(b, axis))
}

function intersectionArea(a: LayoutRect, b: LayoutRect): number {
  const w = overlapAlong(a, b, 'x')
  const h = overlapAlong(a, b, 'y')
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * The neighbours that stand in the drag's way along `axis`, in order.
 *
 * A card belongs to the lane when it shares enough of the perpendicular band
 * with the drag that moving along the axis would actually run into it. Locked
 * cards are never lane members: they cannot give way, so they are walls the
 * drop settle answers for.
 */
export function buildLane(neighbours: LaneRect[], active: LayoutRect, axis: Axis): LaneRect[] {
  const perp = other(axis)
  const lane = neighbours.filter((rect) => {
    if (rect.locked) return false
    const shared = overlapAlong(active, rect, perp)
    if (shared <= 0) return false
    return shared >= Math.min(span(active, perp), span(rect, perp)) * LANE_BAND_RATIO
  })
  lane.sort((a, b) => start(a, axis) - start(b, axis) || (a.id < b.id ? -1 : 1))
  return lane
}

/**
 * Which slot the drag claims: the number of lane cards whose centre it has
 * passed. Held with hysteresis against the previous claim, so the split only
 * moves once the drag has committed a clear distance past a neighbour's
 * middle — and has to come a clear distance back to give it up again.
 */
export function claimIndex(
  lane: LaneRect[],
  active: LayoutRect,
  axis: Axis,
  previous: number | null,
): number {
  const here = middle(active, axis)
  if (previous === null) {
    let seed = 0
    while (seed < lane.length && here > middle(lane[seed]!, axis)) seed++
    return seed
  }
  let index = Math.max(0, Math.min(previous, lane.length))
  while (index < lane.length && here > middle(lane[index]!, axis) + INDEX_HYSTERESIS) index++
  while (index > 0 && here < middle(lane[index - 1]!, axis) - INDEX_HYSTERESIS) index--
  return index
}

/**
 * The whole engine: where every lane card sits given the drag's claimed slot.
 *
 * The dragged rect IS the hole. Cards ordered after the slot must clear its
 * trailing edge, cards ordered before it must clear its leading edge, and each
 * run walks outward until it reaches a card that already had the room — that
 * card and everything past it never move. Positions are read from the
 * baseline, never from the previous frame, so the answer is the same whether
 * the drag arrived here in one jump or a hundred.
 *
 * Returns the signed shift along `axis` per lane position; 0 means "stays
 * exactly where it has always been".
 */
export function laneShifts(
  lane: LaneRect[],
  index: number,
  active: LayoutRect,
  axis: Axis,
  gap = LAYOUT_GAP,
): number[] {
  const shifts = new Array<number>(lane.length).fill(0)

  let frontier = end(active, axis) + gap
  for (let i = index; i < lane.length; i++) {
    const needed = quantize(frontier - start(lane[i]!, axis))
    if (needed <= 0) break
    shifts[i] = needed
    frontier = end(lane[i]!, axis) + needed + gap
  }

  let backier = start(active, axis) - gap
  for (let i = index - 1; i >= 0; i--) {
    const needed = quantize(end(lane[i]!, axis) - backier)
    if (needed <= 0) break
    shifts[i] = -needed
    backier = start(lane[i]!, axis) - needed - gap
  }

  return shifts
}

interface GestureTracker {
  directionX: number
  directionY: number
  axis: Axis | null
  /** The slot claimed last frame, and the lane identity it belongs to. A lane
   *  that changes shape re-seeds the claim from geometry instead of carrying a
   *  stale index into a different list. */
  index: number | null
  laneKey: string | null
  engageStart: number | null
  engaged: boolean
  baseline: ReflowBaseline | null
}

let tracker: GestureTracker | null = null

/** Arm reflow for a new drag gesture. */
export function beginDragReflow(): void {
  tracker = {
    directionX: 0,
    directionY: 0,
    axis: null,
    index: null,
    laneKey: null,
    engageStart: null,
    engaged: false,
    baseline: null,
  }
}

/** Park every live ghost at zero (they glide home) and clear the dim hints. */
function withdrawGhosts(): void {
  const state = useDragReflowStore.getState()
  const ids = Object.keys(state.offsets)
  if (ids.length === 0 && state.pendingSettleIds.size === 0) return
  const offsets: Record<string, Vector2D> = {}
  for (const id of ids) offsets[id] = ZERO_OFFSET
  useDragReflowStore.setState({ offsets, pendingSettleIds: EMPTY_SET })
}

/**
 * Recompute this frame of the gesture. Called from the frame-batched delta
 * callback after the store move applied; `movingIds` mirrors exactly the set
 * the store action changed. `now` is injectable for tests.
 */
export function updateDragReflow(
  movingIds: string[],
  worldDelta: Vector2D,
  now: number = performance.now(),
): void {
  if (!tracker) return

  // Exponentially smoothed drag direction, then a sticky axis: one frame of
  // jitter must not decide which way the lane runs.
  tracker.directionX = tracker.directionX * 0.6 + worldDelta.x * 0.4
  tracker.directionY = tracker.directionY * 0.6 + worldDelta.y * 0.4
  const alongX = Math.abs(tracker.directionX)
  const alongY = Math.abs(tracker.directionY)
  if (tracker.axis === null) {
    if (alongX > 1e-6 || alongY > 1e-6) tracker.axis = alongX >= alongY ? 'x' : 'y'
  } else if (tracker.axis === 'x' && alongY > alongX * AXIS_SWITCH_RATIO) {
    tracker.axis = 'y'
  } else if (tracker.axis === 'y' && alongX > alongY * AXIS_SWITCH_RATIO) {
    tracker.axis = 'x'
  }
  const axis = tracker.axis
  if (axis === null) return

  const state = useWidgetStore.getState()
  const movingKey = movingIds
    .filter((id) => state.widgets[id])
    .slice()
    .sort()
    .join('|')
  if (!tracker.baseline || tracker.baseline.movingKey !== movingKey) {
    tracker.baseline = buildReflowBaseline(
      state.widgets,
      state.glues,
      state.widgetGlueIndex,
      movingIds,
    )
    tracker.index = null
  }
  const baseline = tracker.baseline
  if (!baseline || baseline.neighbours.length === 0) {
    resetClaim()
    withdrawGhosts()
    return
  }

  // The drag's live footprint: baseline size carried to where the cards
  // actually are now, projected onto the grid. Offsets therefore only change
  // on cell crossings, and the preview shows where a drop would land.
  const live = measureCluster(
    state.widgets,
    movingIds.filter((id) => state.widgets[id]),
    baseline.activeIsCluster,
  )
  const active: LayoutRect = {
    id: baseline.active.id,
    x: snapToGrid(live.x),
    y: snapToGrid(live.y),
    width: live.width,
    height: live.height,
  }

  // Engagement gate: meaningful coverage of SOME neighbour, held long enough
  // to read as arriving rather than flying past. Locked cards count — arriving
  // on one is still arriving, and the dim "will settle" hint is the answer.
  // Latches for the gesture: once the board has opened for you, it keeps
  // answering your hand.
  if (!tracker.engaged) {
    const activeArea = active.width * active.height
    const meaningful = baseline.neighbours.some((rect) => {
      const inter = intersectionArea(active, rect)
      if (inter <= 0) return false
      const coverage = Math.max(inter / (rect.width * rect.height), inter / activeArea)
      return coverage >= ENGAGE_COVERAGE_RATIO
    })
    if (!meaningful) {
      resetClaim()
      withdrawGhosts()
      return
    }
    if (tracker.engageStart === null) {
      tracker.engageStart = now
      if (REFLOW_ENGAGE_MS > 0) return
    }
    if (now - tracker.engageStart < REFLOW_ENGAGE_MS) return
    tracker.engaged = true
  }

  // An empty lane is a real answer, not a bail-out: nothing gives way, and
  // whatever the drag is sitting on is published as pending instead.
  const lane = buildLane(baseline.neighbours, active, axis)
  const laneKey = `${axis}:${lane.map((rect) => rect.id).join(',')}`
  const index = claimIndex(lane, active, axis, tracker.laneKey === laneKey ? tracker.index : null)
  tracker.laneKey = laneKey
  tracker.index = index

  const shifts = laneShifts(lane, index, active, axis)
  publish(lane, shifts, axis, baseline, active)
}

function resetClaim(): void {
  if (!tracker) return
  tracker.index = null
  tracker.laneKey = null
  tracker.engageStart = null
}

function publish(
  lane: LaneRect[],
  shifts: number[],
  axis: Axis,
  baseline: ReflowBaseline,
  active: LayoutRect,
): void {
  const previous = useDragReflowStore.getState()
  const offsets: Record<string, Vector2D> = {}
  const shiftedById = new Map<string, LayoutRect>()
  let changed = false

  for (let i = 0; i < lane.length; i++) {
    const rect = lane[i]!
    const shift = shifts[i]!
    if (shift === 0) continue
    const offset: Vector2D = axis === 'x' ? { x: shift, y: 0 } : { x: 0, y: shift }
    shiftedById.set(rect.id, {
      ...rect,
      x: rect.x + offset.x,
      y: rect.y + offset.y,
    })
    // One shared Vector2D per cluster, and the previous frame's reference is
    // reused when the value is unchanged — cards only re-render on real moves.
    const prior = previous.offsets[rect.ids[0]!]
    const shared = prior && prior.x === offset.x && prior.y === offset.y ? prior : offset
    for (const id of rect.ids) {
      offsets[id] = shared
      if (previous.offsets[id] !== shared) changed = true
    }
  }

  // A card whose slot went back to baseline parks at zero so the return glides
  // under the same displaced styling; entries only disappear when the drag ends.
  for (const id of Object.keys(previous.offsets)) {
    if (offsets[id]) continue
    offsets[id] = ZERO_OFFSET
    if (previous.offsets[id] !== ZERO_OFFSET) changed = true
  }
  if (Object.keys(offsets).length !== Object.keys(previous.offsets).length) changed = true

  // Everything the drop will still have to sort out: cards the drag covers
  // that the lane does not speak for (locked, or standing outside the band),
  // and anything a reflowed card has glided on top of.
  const pending = new Set<string>()
  const laneIds = new Set(lane.map((rect) => rect.id))
  for (const rect of baseline.neighbours) {
    const placed = shiftedById.get(rect.id) ?? rect
    const covered =
      intersectionArea(active, placed) > 0 && (rect.locked || !laneIds.has(rect.id))
    const crowded =
      !shiftedById.has(rect.id) &&
      [...shiftedById.values()].some((moved) => intersectionArea(moved, placed) > 0)
    if (covered || crowded) for (const id of rect.ids) pending.add(id)
  }

  let pendingSettleIds = previous.pendingSettleIds
  if (
    pending.size !== previous.pendingSettleIds.size ||
    [...pending].some((id) => !previous.pendingSettleIds.has(id))
  ) {
    pendingSettleIds = pending
    changed = true
  }

  if (changed) useDragReflowStore.setState({ offsets, pendingSettleIds })
}

/**
 * End the gesture and hand back the non-zero offsets for the drop commit.
 * The caller applies them to the board (inside the gesture's single history
 * step) before running the release settle.
 */
export function endDragReflow(): Record<string, Vector2D> {
  tracker = null
  const state = useDragReflowStore.getState()
  const commit: Record<string, Vector2D> = {}
  for (const [id, offset] of Object.entries(state.offsets)) {
    if (offset.x !== 0 || offset.y !== 0) commit[id] = offset
  }
  if (Object.keys(state.offsets).length > 0 || state.pendingSettleIds.size > 0) {
    useDragReflowStore.setState({ offsets: {}, pendingSettleIds: EMPTY_SET })
  }
  return commit
}

/** Drop every ghost without committing anything (cancelled/aborted gesture). */
export function cancelDragReflow(): void {
  tracker = null
  const state = useDragReflowStore.getState()
  if (Object.keys(state.offsets).length > 0 || state.pendingSettleIds.size > 0) {
    useDragReflowStore.setState({ offsets: {}, pendingSettleIds: EMPTY_SET })
  }
}
