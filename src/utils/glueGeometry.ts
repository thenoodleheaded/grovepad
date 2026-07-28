import { GRID_SIZE, snapToGrid, type GlueRestoreEntry, type Size, type Vector2D, type Widget, type WidgetGlue } from '../types/spatial'
import type { WorldRect } from './canvasView'
import { balancedRowCounts } from './ghostTreePresentation'
import { isWidgetResting, restingTileSize, WIDGET_TITLE_ROW, widgetShowsTitleRow } from './widgetRest'

/**
 * The seam between two glued widgets: 0.3 of a grid cell. Close enough that
 * the cards read as one welded object, wide enough that each card keeps its
 * own rounded silhouette and the weld between them has room to show. This gap
 * is NOT stored between the cards — members are stored grid-aligned and
 * touching, and each renders inset by `GLUE_HALF_GAP` on every glued edge, so
 * the seam is carved equally from both cards and the cluster's outer corners
 * always land on the grid (`glueMemberInsets`, `insetGlueRects`).
 */
export const GLUE_GAP = Math.round(GRID_SIZE * 0.3) // 12

/** Half the seam — the inset each of two touching cards gives up on their
 * shared edge, so the gap comes out of both sizes equally. */
const GLUE_HALF_GAP = Math.round(GLUE_GAP / 2) // 6

/**
 * Reach of the option-drag gesture, edge to edge: inside one grid cell the
 * drag reads as "about to glue" (the weld preview appears); an option-drag
 * that leaves a glued widget further than this from every clustermate reads
 * as "pull it off".
 */
export const GLUE_RANGE = GRID_SIZE // 40

/**
 * Reserved band around a cluster for its group frame — the weld seam's 0.3 cell
 * plus a further 0.2 cell of margin, so the boundary lines stand clear of the
 * welded cards rather than hugging them.
 *
 * It is also the cluster's link geometry: a relation to any member anchors to
 * the envelope grown by this band, so a connecting line keeps its gap from the
 * GROUP's boundary line rather than from whichever card happens to sit nearest.
 */
export const GLUE_FRAME_BAND = Math.round(GRID_SIZE * 0.5) // 20

/** The group frame's own title/button row: a 28px strip sitting 4px above the
 * top boundary line (`GlueClusterChrome`'s `TITLE_H` and its gap). */
export const GLUE_TITLE_ROW_H = 28
const GLUE_TITLE_ROW_GAP = 4

/**
 * Extra headroom the group's boundary claims ABOVE its top edge: the frame
 * band plus the title/button row and its gap — a little over one cell. The
 * name and buttons COUNT as part of the group's technical rectangle.
 *
 * This is the height only. The row does NOT span the cluster's full width —
 * the empty canvas beside a short group name belongs to the board, not the
 * group — so the row's actual extent is `clusterTitleRowRect`, and the group's
 * boundary is that rect UNION `clusterFrameEnvelope`, never one grown box.
 */
export const GLUE_TITLE_HEADROOM = GLUE_FRAME_BAND + GLUE_TITLE_ROW_H + GLUE_TITLE_ROW_GAP // 52

/** A bond needs this much shared edge before two cards count as facing each
 * other — less than half a cell of overlap is a corner graze, not a weld. */
const GLUE_MIN_OVERLAP = GRID_SIZE / 2 // 20

/** How far an option-drag may overshoot its target — pushing the dragged card
 * a little *into* the one it means to weld to — and still snap back onto the
 * seam. Without this, releasing while overlapping did nothing, so dragging a
 * card "onto" its neighbour never glued; the hand had to stop dead in the
 * narrow gap band. Kept below half a cell so a card dropped squarely on top of
 * another (overlapping past this on both axes) still finds no facing edge. */
const GLUE_OVERSHOOT = Math.round(GRID_SIZE / 2) // 20

/** The box a glued widget visually occupies: its resting tile while it rests,
 * otherwise its stored card. Welds hug what the eye sees, not dormant sizes. */
export function glueBoxRect(widget: Widget): WorldRect {
  const box = isWidgetResting(widget, { expandedWidgetId: null })
    ? restingTileSize(widget)
    : widget.size
  return { x: widget.position.x, y: widget.position.y, width: box.width, height: box.height }
}

interface EdgeGaps {
  /** Clear air between the pair on each axis; negative when they overlap. */
  gapX: number
  gapY: number
  /** Shared projected edge on the perpendicular axis. */
  overlapX: number
  overlapY: number
}

function edgeGaps(a: WorldRect, b: WorldRect): EdgeGaps {
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width)
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height)
  return { gapX, gapY, overlapX: -gapX, overlapY: -gapY }
}

/** Edge-to-edge separation of two boxes: 0 when they touch or overlap. */
export function glueSeparation(a: WorldRect, b: WorldRect): number {
  const { gapX, gapY } = edgeGaps(a, b)
  return Math.max(gapX, gapY, 0)
}

export interface GlueEdgeInsets {
  left: number
  right: number
  top: number
  bottom: number
}

const NO_INSETS: GlueEdgeInsets = { left: 0, right: 0, top: 0, bottom: 0 }
/** Slack when deciding "these two edges touch" — stored boxes settle to whole
 * pixels, so anything closer than this counts as a shared edge. */
const TOUCH_EPS = 1.5

/** Which of a box's four edges are welded to a clustermate (share that edge,
 * with real perpendicular overlap). Each welded edge gives up `GLUE_HALF_GAP`,
 * so the seam is carved equally from both cards. */
function edgeInsets(a: WorldRect, others: readonly WorldRect[]): GlueEdgeInsets {
  let left = 0, right = 0, top = 0, bottom = 0
  for (const o of others) {
    const overlapY = Math.min(a.y + a.height, o.y + o.height) - Math.max(a.y, o.y)
    const overlapX = Math.min(a.x + a.width, o.x + o.width) - Math.max(a.x, o.x)
    if (overlapY > TOUCH_EPS) {
      if (Math.abs(a.x + a.width - o.x) <= TOUCH_EPS) right = GLUE_HALF_GAP
      if (Math.abs(a.x - (o.x + o.width)) <= TOUCH_EPS) left = GLUE_HALF_GAP
    }
    if (overlapX > TOUCH_EPS) {
      if (Math.abs(a.y + a.height - o.y) <= TOUCH_EPS) bottom = GLUE_HALF_GAP
      if (Math.abs(a.y - (o.y + o.height)) <= TOUCH_EPS) top = GLUE_HALF_GAP
    }
  }
  return { left, right, top, bottom }
}

function applyInsets(a: WorldRect, insets: GlueEdgeInsets): WorldRect {
  return {
    x: a.x + insets.left,
    y: a.y + insets.top,
    width: a.width - insets.left - insets.right,
    height: a.height - insets.top - insets.bottom,
  }
}

/** The render insets for one glued member: how much it shrinks on each edge
 * that welds to a clustermate. Zero on every free edge, so the member's outer
 * corners stay exactly on the grid its stored box sits on. */
export function glueMemberInsets(
  widgetId: string,
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): GlueEdgeInsets {
  const self = widgets[widgetId]
  if (!self) return NO_INSETS
  const others: WorldRect[] = []
  for (const id of memberIds) {
    if (id === widgetId) continue
    const w = widgets[id]
    if (w) others.push(glueBoxRect(w))
  }
  return edgeInsets(glueBoxRect(self), others)
}

/** Every member's on-screen (inset) box: the stored grid-aligned box pulled in
 * by `GLUE_HALF_GAP` on each welded edge. Seams live in the gaps this opens. */
export function insetGlueRects(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): Map<string, WorldRect> {
  const boxes: Array<[string, WorldRect]> = []
  for (const id of memberIds) {
    const w = widgets[id]
    if (w) boxes.push([id, glueBoxRect(w)])
  }
  const result = new Map<string, WorldRect>()
  for (const [id, box] of boxes) {
    const others = boxes.filter(([otherId]) => otherId !== id).map(([, rect]) => rect)
    result.set(id, applyInsets(box, edgeInsets(box, others)))
  }
  return result
}

/** The grid-aligned outer box of a whole cluster, from its stored member boxes
 * (before insets) — the footprint the group frame and its lines span. */
/**
 * A widget's box INCLUDING the floating title row it shows — the strip the
 * name and action buttons occupy above the card. Chrome is not free space: a
 * card packed right below another must leave room for its own title row, or
 * that row is painted straight over the neighbour above it.
 *
 * `glued` says whether the widget is being measured as a cluster member (where
 * the group frame owns the name, so only a PINNED member floats a row of its
 * own). Everything that reserves space for a welded cluster — the reflow, the
 * gap close, the board settle — measures with this, not with the bare box.
 */
export function glueChromeRect(widget: Widget, glued = true): WorldRect {
  const box = glueBoxRect(widget)
  if (!widgetShowsTitleRow(widget, { glued })) return box
  return {
    x: box.x,
    y: box.y - WIDGET_TITLE_ROW,
    width: box.width,
    height: box.height + WIDGET_TITLE_ROW,
  }
}

/** Union of every member's chrome box — the cluster's real occupied space. */
function chromeEnvelope(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): WorldRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let found = false
  for (const id of memberIds) {
    const w = widgets[id]
    if (!w) continue
    found = true
    const b = glueChromeRect(w)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return found ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null
}

export function clusterEnvelope(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): WorldRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let found = false
  for (const id of memberIds) {
    const w = widgets[id]
    if (!w) continue
    found = true
    const b = glueBoxRect(w)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return found ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null
}

/**
 * The group's full on-board rectangle: the member envelope grown by the frame
 * band on every side and by `GLUE_TITLE_HEADROOM` at the top, so the boundary
 * lines AND the title/button row are inside it. This is the box a relation
 * keeps its distance from and the whole hit area a cmd-drag relation can be
 * dropped on.
 */
export function clusterFrameEnvelope(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): WorldRect | null {
  const env = chromeEnvelope(memberIds, widgets)
  if (!env) return null
  return {
    x: env.x - GLUE_FRAME_BAND,
    y: env.y - GLUE_FRAME_BAND,
    width: env.width + GLUE_FRAME_BAND * 2,
    height: env.height + GLUE_FRAME_BAND * 2,
  }
}

/** Widest a group name is allowed to paint before it truncates, and the rough
 * px-per-character of the row's 12px bold type — a layout estimate mirroring
 * the DOM, never a measurement (this stays free of layout reads). */
const GLUE_NAME_MAX = 200
const GLUE_NAME_CHAR = 7
/** Icon square, its trailing gap, and one button cell (20px + the row's 2px
 * gap). Buttons: up to Complete, Favorite, Delete, Collapse, Ungroup. */
const GLUE_TITLE_ICON = 28 + 8
const GLUE_TITLE_BUTTON = 22
const GLUE_TITLE_BUTTONS_MAX = 5

/**
 * The group's title/button row as it is actually painted: anchored on the
 * cluster's drawn envelope (member boxes, the same origin `GlueClusterChrome`
 * lays the bar out from), sitting above the top boundary line, and only as
 * wide as the icon, the name, and the buttons really are.
 *
 * Bounding this is the whole point: a relation dropped on the row lands on the
 * group and a line dodges the row, while the empty canvas to its right stays
 * ordinary board — free to hold another widget, free to be dropped on.
 */
export function clusterTitleRowRect(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
  name: string | undefined,
): WorldRect | null {
  const env = clusterEnvelope(memberIds, widgets)
  if (!env) return null
  const label = name?.trim() || 'Group'
  const width =
    GLUE_TITLE_ICON +
    Math.min(GLUE_NAME_MAX, label.length * GLUE_NAME_CHAR) +
    GLUE_TITLE_BUTTON * GLUE_TITLE_BUTTONS_MAX
  return {
    x: env.x,
    y: env.y - GLUE_TITLE_HEADROOM,
    width,
    height: GLUE_TITLE_ROW_H,
  }
}

// ---------------------------------------------------------------------------
// Cluster reflow — what a welded cluster does when one of its own members
// changes footprint.
// ---------------------------------------------------------------------------

/** Slack below which an intersection is rounding noise, not an overlap. */
const REFLOW_EPS = 0.5
/** Enough relaxation passes for any cluster a person can build by hand; the
 * cap only exists so a pathological arrangement cannot spin. */
const REFLOW_PASSES = 24

export interface WeldedBox {
  id: string
  rect: WorldRect
}

/**
 * Re-pack a welded cluster around members whose footprint just changed.
 *
 * A cluster is stored as cards that TOUCH, and the settle pass deliberately
 * treats the whole cluster as one rigid unit — members never collide with each
 * other there, which is what keeps the 0.3-cell seams intact through every
 * board-level shove. The cost is that a member growing *inside* the cluster
 * (pinned open, scaled back to a full card, renamed into a wider tile) simply
 * grew straight through its clustermates and nothing moved.
 *
 * So the cluster resolves its own overlaps first, with its own rule: push each
 * overlapping neighbour by EXACTLY the penetration, along the shallower axis.
 * Exactly the penetration means the pair ends up touching again rather than a
 * whole grid cell apart — the weld survives, the seam re-carves itself from
 * `glueMemberInsets`, and the group still reads as one object. Anchored
 * members (the card that was just acted on) never move; everything else gives
 * way around them, the same promise the board-level check makes.
 *
 * Pure: takes visible boxes, returns the members whose top-left moved.
 */
export function reflowWeldedCluster(
  boxes: readonly WeldedBox[],
  anchorIds: readonly string[],
): Map<string, Vector2D> {
  const moved = new Map<string, Vector2D>()
  if (boxes.length < 2) return moved

  const anchored = new Set(anchorIds)
  // With nothing anchored the cluster has no still point to give way around,
  // so the first member (the cluster's leading card) holds it.
  if (!boxes.some((box) => anchored.has(box.id))) anchored.add(boxes[0]!.id)

  const live = boxes.map((box) => ({ id: box.id, ...box.rect }))
  let dirty = false

  // The axis the CLUSTER as a whole is laid out on, read once from where the
  // members started. It is the last word on which way a pair opens when the
  // pair itself no longer has an arrangement to read — see the swallowed case
  // below.
  let envMinX = Infinity, envMinY = Infinity, envMaxX = -Infinity, envMaxY = -Infinity
  for (const rect of live) {
    envMinX = Math.min(envMinX, rect.x)
    envMinY = Math.min(envMinY, rect.y)
    envMaxX = Math.max(envMaxX, rect.x + rect.width)
    envMaxY = Math.max(envMaxY, rect.y + rect.height)
  }
  const clusterRunsX = envMaxX - envMinX >= envMaxY - envMinY

  for (let pass = 0; pass < REFLOW_PASSES; pass += 1) {
    let overlapped = false
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i]!
        const b = live[j]!
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapX <= REFLOW_EPS || overlapY <= REFLOW_EPS) continue
        const aFixed = anchored.has(a.id)
        const bFixed = anchored.has(b.id)
        // Two anchored members cannot resolve each other; the caller asked for
        // both to hold, so this pair is left exactly as it stands.
        if (aFixed && bFixed) continue
        overlapped = true
        dirty = true
        // Two free members split the push; against an anchor the free one
        // gives up the whole penetration.
        const shareA = aFixed ? 0 : bFixed ? 1 : 0.5
        const shareB = 1 - shareA
        // Push along the axis the pair is ARRANGED on, not the shallower
        // overlap: a card welded to your right belongs to your right, and must
        // slide further right rather than being lifted above you because that
        // happened to be the cheaper escape. Separation is measured relative to
        // the pair's own size, so a wide card beside a tall one still reads its
        // arrangement correctly. Concentric boxes have no arrangement to keep,
        // and fall back to the cheapest way out.
        const spanX = (a.width + b.width) / 2
        const spanY = (a.height + b.height) / 2
        const alongX = Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) / (spanX || 1)
        const alongY = Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) / (spanY || 1)
        // A card that has been SWALLOWED WHOLE — its box inside the other's on
        // both axes — has no arrangement left to read: the centres very nearly
        // coincide, so every comparison here is a coin flip and the cheapest
        // escape is meaningless (there is no near edge to leave by). That is
        // exactly what a card pinned open inside a row of icons does to its
        // neighbour, and the coin flip lifted that neighbour OUT OF THE ROW,
        // where nothing ever brought it back. The cluster's own axis decides
        // instead, so a row stays a row.
        const swallowed =
          Math.min(overlapX, a.width, b.width) >= Math.min(a.width, b.width) - REFLOW_EPS &&
          Math.min(overlapY, a.height, b.height) >= Math.min(a.height, b.height) - REFLOW_EPS
        const pushX = swallowed
          ? clusterRunsX
          : alongX === alongY
            ? overlapX <= overlapY
            : alongX > alongY
        // The pair keeps the order it already has — whoever is nearer the start
        // of the axis stays there. Choosing by the shorter escape instead let a
        // swallowed pair come out the other way round, so two cards visibly
        // traded places on the row.
        // Travel is then the true cost of separating in THAT direction, not the
        // raw overlap: for boxes that merely graze the two are the same number,
        // but a swallowed card's overlap is only its own width, and moving by
        // that leaves it still inside.
        if (pushX) {
          const direction = a.x + a.width / 2 <= b.x + b.width / 2 ? -1 : 1
          const travel = direction < 0 ? a.x + a.width - b.x : b.x + b.width - a.x
          a.x += direction * travel * shareA
          b.x -= direction * travel * shareB
        } else {
          const direction = a.y + a.height / 2 <= b.y + b.height / 2 ? -1 : 1
          const travel = direction < 0 ? a.y + a.height - b.y : b.y + b.height - a.y
          a.y += direction * travel * shareA
          b.y -= direction * travel * shareB
        }
      }
    }
    if (!overlapped) break
  }

  if (!dirty) return moved
  for (let i = 0; i < live.length; i += 1) {
    const start = boxes[i]!
    const end = live[i]!
    // Whole pixels: stored member boxes are integral, and a half-pixel drift
    // would accumulate through repeated folds. A 1px rounding is well inside
    // the touch epsilon the seam insets use, so welds still read as welds.
    const x = Math.round(end.x)
    const y = Math.round(end.y)
    if (x !== start.rect.x || y !== start.rect.y) moved.set(start.id, { x, y })
  }
  return moved
}

interface LiveRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** The two axes, each named alongside its perpendicular, so the gravity pass
 * below is written once and run twice rather than duplicated per axis. */
const COMPACT_AXES = [
  { pos: 'x', size: 'width', perpPos: 'y', perpSize: 'height' },
  { pos: 'y', size: 'height', perpPos: 'x', perpSize: 'width' },
] as const

/**
 * Pull a welded cluster's members back onto each other after one of them
 * shrank or left — the exact mirror of `reflowWeldedCluster`.
 *
 * The push half already answers what a cluster does when a member GROWS. This
 * is the same story in reverse, and it must be, or the two are not inverses
 * and an open/close round trip inside a group does not return the layout it
 * started from. So it keeps the same three laws: anchored members never move,
 * a member travels along the axis it is arranged on (never diagonally, so rows
 * stay rows), and it lands EXACTLY touching, which is what lets the seam
 * re-carve itself from `glueMemberInsets` and the group keep reading as one
 * object.
 *
 * Each free member slides toward the anchored block until it meets something —
 * gravity, one axis at a time, nearest member first so a card only ever closes
 * onto what has already arrived. Travel is capped by the nearest box sharing
 * its lane, so compacting can never produce an overlap; a member with nothing
 * ahead of it on an axis stays put rather than drifting into empty space.
 *
 * This is what closes an INTERIOR hole. Connectivity alone cannot see one: pull
 * the middle card out of a block and every survivor still touches its
 * neighbours around the gap, so the cluster never "falls apart" and a
 * component-level repair concludes there is nothing to do.
 *
 * Pure: takes visible boxes, returns the members whose top-left moved.
 */
export function compactWeldedCluster(
  boxes: readonly WeldedBox[],
  anchorIds: readonly string[],
): Map<string, Vector2D> {
  const moved = new Map<string, Vector2D>()
  if (boxes.length < 2) return moved

  const ids = new Set(boxes.map((box) => box.id))
  const anchored = new Set(anchorIds.filter((id) => ids.has(id)))
  // Same still point the push half falls back on: with nothing anchored the
  // cluster's leading card holds and everything gathers onto it.
  if (anchored.size === 0) anchored.add(boxes[0]!.id)

  const live: LiveRect[] = boxes.map((box) => ({ id: box.id, ...box.rect }))
  // Anchored members never move, so the block they form is fixed for the whole
  // pass and every direction below is read off it once.
  let blockMinX = Infinity, blockMinY = Infinity, blockMaxX = -Infinity, blockMaxY = -Infinity
  for (const rect of live) {
    if (!anchored.has(rect.id)) continue
    blockMinX = Math.min(blockMinX, rect.x)
    blockMinY = Math.min(blockMinY, rect.y)
    blockMaxX = Math.max(blockMaxX, rect.x + rect.width)
    blockMaxY = Math.max(blockMaxY, rect.y + rect.height)
  }
  const block = {
    x: { min: blockMinX, max: blockMaxX },
    y: { min: blockMinY, max: blockMaxY },
  }

  const free = live.filter((rect) => !anchored.has(rect.id))
  if (free.length === 0) return moved
  let dirty = false

  for (let pass = 0; pass < REFLOW_PASSES; pass += 1) {
    let closed = false
    for (const axis of COMPACT_AXES) {
      const { min: blockMin, max: blockMax } = block[axis.pos]
      const blockCentre = (blockMin + blockMax) / 2
      // Nearest first. Out of order, a far card stops where a near one has not
      // arrived yet; the passes would still converge, but this closes a row in
      // one sweep and keeps the result independent of member order.
      const ordered = [...free].sort(
        (a, b) =>
          Math.abs(a[axis.pos] + a[axis.size] / 2 - blockCentre) -
          Math.abs(b[axis.pos] + b[axis.size] / 2 - blockCentre),
      )
      for (const rect of ordered) {
        const start = rect[axis.pos]
        const end = start + rect[axis.size]
        // A member straddling the block's span on this axis is already in its
        // column: it has no side to come from, and its travel is the other
        // axis's business.
        const direction = end <= blockMin + REFLOW_EPS ? 1 : start >= blockMax - REFLOW_EPS ? -1 : 0
        if (direction === 0) continue
        let travel = Infinity
        for (const other of live) {
          if (other === rect) continue
          // Boxes that merely touch edge-on share no lane and slide past each
          // other; only a real shared span can block.
          const lane =
            Math.min(rect[axis.perpPos] + rect[axis.perpSize], other[axis.perpPos] + other[axis.perpSize]) -
            Math.max(rect[axis.perpPos], other[axis.perpPos])
          if (lane <= REFLOW_EPS) continue
          const gap =
            direction < 0
              ? start - (other[axis.pos] + other[axis.size])
              : other[axis.pos] - end
          // Negative means the other box is behind, or already met: not
          // something this member can close onto.
          if (gap < -REFLOW_EPS) continue
          // A gap no wider than the seam IS the weld — a cluster welded by the
          // option-drag gesture is stored exactly `GLUE_GAP` apart, and a
          // cluster stored touching carves the same seam out of both cards, so
          // the two read identically. Closing one would tighten a real weld and
          // walk the whole group in by a seam on every footprint change. Such a
          // neighbour stops this member dead instead.
          travel = Math.min(travel, gap <= GLUE_GAP + REFLOW_EPS ? 0 : gap)
        }
        // Nothing ahead on this axis. A card with no one to weld against must
        // hold its place rather than sail across the board toward the anchor.
        if (travel === Infinity || travel <= REFLOW_EPS) continue
        rect[axis.pos] += direction * travel
        closed = true
        dirty = true
      }
    }
    if (!closed) break
  }

  if (!dirty) return moved
  for (let i = 0; i < live.length; i += 1) {
    const start = boxes[i]!
    const end = live[i]!
    // Whole pixels, exactly as the push half rounds — see the note there.
    const x = Math.round(end.x)
    const y = Math.round(end.y)
    if (x !== start.rect.x || y !== start.rect.y) moved.set(start.id, { x, y })
  }
  return moved
}

// ---------------------------------------------------------------------------
// Collapsed clusters — the folded collection.
// ---------------------------------------------------------------------------

/**
 * One folded member: a single grid cell. Deliberately below the 2×2 icon floor
 * that governs every *aimable* icon, because a collapsed cluster is ONE
 * pointer target — the whole collection unfolds on any click, and no member
 * inside it is separately hoverable, resizable or clickable. Rendering carves
 * the usual half-seam out of each welded edge, so the painted squares come out
 * at the same size and rhythm as the ghost tree's stacked icons.
 */
export const COLLAPSED_MEMBER_SIZE: Size = { width: GRID_SIZE, height: GRID_SIZE }

/**
 * A folded member gives up the half-seam on ALL FOUR edges, not only where it
 * welds. Inside a fold every cell is the same square in the same rhythm — the
 * one at the end of a row must not paint wider than the one beside it just
 * because its outer edge happens to be free. The block's outer boundary sits
 * half a seam inside its cells, which is exactly what the group frame's own
 * band is there to hold.
 */
export function foldedMemberInsets(): GlueEdgeInsets {
  return { left: GLUE_HALF_GAP, right: GLUE_HALF_GAP, top: GLUE_HALF_GAP, bottom: GLUE_HALF_GAP }
}

export interface CollapsedLayout {
  width: number
  height: number
  offsets: Vector2D[]
}

/**
 * Where each member sits inside a folded cluster: single cells packed into the
 * closest practical square, short rows centred — the SAME stacking the ghost
 * tree shaper uses for a node holding several widgets (`balancedRowCounts`), so
 * a bundle looks the same folded on the board as it did as a ghost.
 *
 * Centring is rounded to whole cells so the collection stays grid-aligned and
 * every member keeps touching its neighbours (the fold is still a weld).
 */
export function collapsedClusterLayout(count: number): CollapsedLayout {
  const total = Math.max(0, Math.floor(count))
  if (total === 0) return { width: 0, height: 0, offsets: [] }
  const rowCounts = balancedRowCounts(total)
  const columns = Math.max(...rowCounts)
  const offsets: Vector2D[] = []
  rowCounts.forEach((rowCount, row) => {
    const lead = Math.floor((columns - rowCount) / 2)
    for (let column = 0; column < rowCount; column += 1) {
      offsets.push({
        x: (lead + column) * COLLAPSED_MEMBER_SIZE.width,
        y: row * COLLAPSED_MEMBER_SIZE.height,
      })
    }
  })
  return {
    width: columns * COLLAPSED_MEMBER_SIZE.width,
    height: rowCounts.length * COLLAPSED_MEMBER_SIZE.height,
    offsets,
  }
}

/**
 * Fold (or re-fold) a set of members into the single-cell packed collection.
 *
 * The one owner of what a collapsed cluster looks like, used by the first fold,
 * by a widget welded INTO a collapsed group, and by a group re-packing after a
 * member leaves. Members already folded keep the pre-fold state they recorded
 * the first time (`existingRestore`); a newcomer has its CURRENT state recorded
 * now, so unfolding returns it exactly where it was when it joined. Everyone
 * shrinks to one cell and re-packs, so the block always reads as one even grid.
 *
 * The block anchors on the members that were already folded, so welding a card
 * onto an existing collection re-stacks it in place instead of jumping the
 * whole block to the newcomer's corner. On a first fold (no prior restore) it
 * anchors on the top-left of the members' own footprints.
 *
 * Pure: returns fresh widgets, the trimmed restore map (only present members),
 * and the block's anchor — the folded top-left the glue record stores as
 * `foldedAt`, so a later expand can tell how far the block travelled.
 */
export function refoldCollapsedCluster(
  widgets: Record<string, Widget>,
  memberIds: readonly string[],
  existingRestore: Record<string, GlueRestoreEntry> | undefined,
  previousFoldedAt?: Vector2D,
): { widgets: Record<string, Widget>; restore: Record<string, GlueRestoreEntry>; anchor: Vector2D } {
  const present = memberIds.filter((id) => widgets[id])

  // Anchor on the already-folded members (the standing block) when there are
  // any, so a merge re-stacks in place; otherwise on all of them (first fold).
  const anchorFrom = present.filter((id) => existingRestore?.[id])
  const forAnchor = anchorFrom.length > 0 ? anchorFrom : present
  let anchorX = Infinity
  let anchorY = Infinity
  for (const id of forAnchor) {
    anchorX = Math.min(anchorX, widgets[id]!.position.x)
    anchorY = Math.min(anchorY, widgets[id]!.position.y)
  }
  anchorX = snapToGrid(Number.isFinite(anchorX) ? anchorX : 0)
  anchorY = snapToGrid(Number.isFinite(anchorY) ? anchorY : 0)

  // The anchor we return becomes the record's new `foldedAt`, and a later
  // expand measures the block's travel against it. Carried-over restore
  // entries were written in the frame of the PREVIOUS anchor, so they have to
  // ride the distance the block has already travelled — otherwise the fresh
  // anchor makes `foldedBlockShift` read zero and every survivor rewinds to
  // wherever the group was first folded, hundreds of pixels away. A member
  // being recorded for the first time is already in the current frame.
  const rebaseX = previousFoldedAt ? anchorX - previousFoldedAt.x : 0
  const rebaseY = previousFoldedAt ? anchorY - previousFoldedAt.y : 0

  const restore: Record<string, GlueRestoreEntry> = {}
  for (const id of present) {
    const saved = existingRestore?.[id]
    if (saved) {
      restore[id] = { ...saved, x: saved.x + rebaseX, y: saved.y + rebaseY }
      continue
    }
    const w = widgets[id]!
    restore[id] = {
      x: w.position.x,
      y: w.position.y,
      width: w.size.width,
      height: w.size.height,
      iconified: w.iconified === true,
    }
  }

  const layout = collapsedClusterLayout(present.length)
  const next = { ...widgets }
  present.forEach((id, index) => {
    const w = widgets[id]!
    const offset = layout.offsets[index] ?? { x: 0, y: 0 }
    next[id] = {
      ...w,
      iconified: true,
      // A member folded from a full card parks that full size for later; one
      // that was already an icon (or already folded) keeps the size it knew.
      expandedSize: w.iconified ? w.expandedSize : w.size,
      size: { ...COLLAPSED_MEMBER_SIZE },
      position: { x: anchorX + offset.x, y: anchorY + offset.y },
    }
  })
  return { widgets: next, restore, anchor: { x: anchorX, y: anchorY } }
}

/**
 * How far a folded block has travelled since its fold was recorded: the block's
 * current top-left minus the anchor the fold wrote down. Every position in the
 * restore map rides this delta on the way back out, so a group dragged while
 * collapsed expands (or releases a member) around where it sits NOW instead of
 * rewinding to wherever it happened to be folded. A record with no anchor (an
 * older board) falls back to zero — the exact-restore behavior it was saved
 * under.
 */
export function foldedBlockShift(
  widgets: Record<string, Widget>,
  glue: WidgetGlue,
): Vector2D {
  if (!glue.foldedAt) return { x: 0, y: 0 }
  let minX = Infinity
  let minY = Infinity
  for (const id of glue.widgetIds) {
    const w = widgets[id]
    if (!w) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0 }
  return { x: minX - glue.foldedAt.x, y: minY - glue.foldedAt.y }
}

/**
 * Restore any widget still at the folded 1×1 size whose cluster is no longer
 * collapsed — it left the group, or the group dissolved. A released member can
 * NEVER be left as a sub-floor icon (below the 2×2 aim-at floor), so it is put
 * back to the exact state it was folded from when that memory survives
 * (`prevGlues`' restore map), else to its dormant full size.
 *
 * Safe to run after any glue change: a user icon can never legitimately be
 * 1×1 (the floor forbids it), so the size alone identifies an orphaned fold.
 * Returns the same reference when nothing needed fixing.
 */
export function unfoldReleasedFoldedMembers(
  widgets: Record<string, Widget>,
  prevGlues: Record<string, WidgetGlue>,
  nextGlues: Record<string, WidgetGlue>,
): Record<string, Widget> {
  const stillFolded = new Set<string>()
  for (const glue of Object.values(nextGlues)) {
    if (glue.collapsed === true) for (const id of glue.widgetIds) stillFolded.add(id)
  }
  const restoreFor = (
    id: string,
  ): { entry: GlueRestoreEntry; glue: WidgetGlue } | undefined => {
    for (const glue of Object.values(prevGlues)) {
      if (glue.collapsed === true && glue.restore?.[id]) return { entry: glue.restore[id]!, glue }
    }
    return undefined
  }
  let next: Record<string, Widget> | null = null
  for (const [id, w] of Object.entries(widgets)) {
    const folded =
      w.iconified === true &&
      w.size.width === COLLAPSED_MEMBER_SIZE.width &&
      w.size.height === COLLAPSED_MEMBER_SIZE.height
    if (!folded || stillFolded.has(id)) continue
    const saved = restoreFor(id)
    // The pre-fold spot rides the block's travel: a member released from a
    // group that was dragged while collapsed lands near the group's current
    // position, not back where the fold once happened.
    const shift = saved ? foldedBlockShift(widgets, saved.glue) : { x: 0, y: 0 }
    const restored: Widget = saved
      ? {
          ...w,
          iconified: saved.entry.iconified,
          size: { width: saved.entry.width, height: saved.entry.height },
          position: { x: saved.entry.x + shift.x, y: saved.entry.y + shift.y },
        }
      : { ...w, iconified: false, size: w.expandedSize ?? w.size, expandedSize: undefined }
    if (!next) next = { ...widgets }
    next[id] = restored
  }
  return next ?? widgets
}

export interface GlueSnap {
  targetId: string
  /** Where the dragged widget's top-left lands when the bond commits. */
  position: Vector2D
  axis: 'x' | 'y'
}

/**
 * The bond an option-drag would commit at the dragged widget's current spot:
 * the nearest widget whose facing edge sits within `GLUE_RANGE` and shares
 * enough perpendicular overlap to weld. The returned position slides the
 * dragged widget along the bond axis until its edge TOUCHES the target's
 * (gap 0), and grid-snaps its perpendicular coordinate — so the cluster's
 * outer corners land on the grid and the visible seam is carved from both
 * cards' render insets, not added between their stored boxes.
 */
export function findGlueSnap(
  dragged: Widget,
  widgets: Record<string, Widget>,
  options: { excludeIds?: ReadonlySet<string> } = {},
): GlueSnap | null {
  const draggedBox = glueBoxRect(dragged)
  let best: { snap: GlueSnap; gap: number } | null = null

  for (const candidate of Object.values(widgets)) {
    if (candidate.id === dragged.id) continue
    if (candidate.canvasId !== dragged.canvasId) continue
    if (options.excludeIds?.has(candidate.id)) continue
    // A locked widget cannot be dragged, so a cluster containing it could
    // never move as one — it is not a weld target.
    if (candidate.metadata.locked) continue
    const box = glueBoxRect(candidate)
    const { gapX, gapY, overlapX, overlapY } = edgeGaps(draggedBox, box)

    // A facing edge counts from a little overlap (overshoot) out to one cell.
    // Rank candidates by how far the seam still is from its resting `GLUE_GAP`
    // — `Math.abs` so a small overshoot loses to a clean near-miss rather than
    // winning for being "most overlapped".
    if (gapX >= -GLUE_OVERSHOOT && gapX <= GLUE_RANGE && overlapY >= GLUE_MIN_OVERLAP) {
      const score = Math.abs(gapX)
      if (!best || score < best.gap) {
        const draggedOnLeft = draggedBox.x <= box.x
        best = {
          gap: score,
          snap: {
            targetId: candidate.id,
            axis: 'x',
            position: {
              x: draggedOnLeft
                ? box.x - draggedBox.width
                : box.x + box.width,
              y: snapToGrid(dragged.position.y),
            },
          },
        }
      }
    } else if (gapY >= -GLUE_OVERSHOOT && gapY <= GLUE_RANGE && overlapX >= GLUE_MIN_OVERLAP) {
      const score = Math.abs(gapY)
      if (!best || score < best.gap) {
        const draggedOnTop = draggedBox.y <= box.y
        best = {
          gap: score,
          snap: {
            targetId: candidate.id,
            axis: 'y',
            position: {
              x: snapToGrid(dragged.position.x),
              y: draggedOnTop
                ? box.y - draggedBox.height
                : box.y + box.height,
            },
          },
        }
      }
    }
  }

  return best?.snap ?? null
}

/**
 * True when an option-dragged clustermate has been pulled clear of the whole
 * cluster: further than `GLUE_RANGE` from every remaining member. Crossing
 * this line is what turns the drag into an unglue.
 */
export function pulledFreeOfCluster(
  dragged: Widget,
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
): boolean {
  const draggedBox = glueBoxRect(dragged)
  for (const id of memberIds) {
    if (id === dragged.id) continue
    const member = widgets[id]
    if (!member) continue
    if (glueSeparation(draggedBox, glueBoxRect(member)) <= GLUE_RANGE) return false
  }
  return true
}

/**
 * The members of a cluster grouped by what still touches what: a graph where
 * two members share an edge when their visible boxes sit within `GLUE_RANGE`
 * (the same "still attached" reach the pull-off gesture uses). Members that
 * have drifted or been cut off from the rest fall into their own component.
 * Missing/unknown widgets are dropped. Order within each component follows the
 * input order, so the first member of a cluster leads its component.
 */
export function connectedGlueComponents(
  memberIds: readonly string[],
  widgets: Record<string, Widget>,
  reach: number = GLUE_RANGE,
): string[][] {
  const ids = memberIds.filter((id) => widgets[id])
  const boxes = new Map(ids.map((id) => [id, glueBoxRect(widgets[id]!)]))
  const seen = new Set<string>()
  const components: string[][] = []
  for (const start of ids) {
    if (seen.has(start)) continue
    seen.add(start)
    const component: string[] = []
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const other of ids) {
        if (seen.has(other)) continue
        if (glueSeparation(boxes.get(current)!, boxes.get(other)!) <= reach) {
          seen.add(other)
          queue.push(other)
        }
      }
    }
    components.push(component)
  }
  return components
}

/**
 * Pull the surviving members of a cluster back together after one of them was
 * removed, or after one shrank: any component that no longer touches the rest
 * slides toward the standing block until the envelopes meet, so deleting the
 * middle card of a stack closes the gap and the survivors re-weld as ONE group
 * instead of the record splitting into fragments that drift apart. Removal and
 * shrinkage both pull the cluster inward, so the close can never create a new
 * overlap with the rest of the board. Pure; returns the same reference when
 * nothing had separated.
 *
 * Connectedness here is measured at `GLUE_GAP` — the carved seam's own width —
 * NOT at the option-drag `GLUE_RANGE`. Members up to a seam apart still READ as
 * welded, so nothing needs closing; anything wider is a hole the eye sees. At
 * `GLUE_RANGE` the check was blind to every sub-cell hole: the record stayed
 * whole so no reconcile would split it, nothing else would close it, and the
 * seam insets (`edgeInsets`) had already stopped drawing — cards left visibly
 * adrift inside a frame that still enclosed them. A one-cell shrink is the
 * commonest shrink there is, because committed resizes snap to the grid.
 */
export function closeClusterGaps(
  widgets: Record<string, Widget>,
  memberIds: readonly string[],
  anchorIds: readonly string[] = [],
): Record<string, Widget> {
  const present = memberIds.filter((id) => widgets[id])
  if (present.length < 2) return widgets
  let next = widgets
  const components = connectedGlueComponents(present, widgets, GLUE_GAP)
  if (components.length > 1) {
    next = { ...widgets }
    const merged: string[] = [...components[0]!]
    for (const component of components.slice(1)) {
      // Chrome boxes, so a group closing ranks stops where the arriving card's
      // own title row begins rather than sliding it under the card above.
      const block = chromeEnvelope(merged, next)!
      const env = chromeEnvelope(component, next)!
      const { gapX, gapY } = edgeGaps(block, env)
      // Close whichever axes actually hold clear air, toward the block. This
      // step exists for a piece that drifted DIAGONALLY clear of the rest,
      // sharing no lane with it — gravity below has nothing to pull such a
      // piece against, and only a whole-envelope move brings it back in reach.
      const dx = gapX > 0 ? (env.x + env.width / 2 >= block.x + block.width / 2 ? -gapX : gapX) : 0
      const dy = gapY > 0 ? (env.y + env.height / 2 >= block.y + block.height / 2 ? -gapY : gapY) : 0
      for (const id of component) {
        const w = next[id]!
        next[id] = { ...w, position: { x: w.position.x + dx, y: w.position.y + dy } }
      }
      merged.push(...component)
    }
  }
  // Then close the holes connectivity cannot see. A card taken out of the
  // MIDDLE of a block leaves every survivor still touching its neighbours
  // around the gap, so the step above sees one whole cluster and does nothing:
  // the hole is only ever closed here.
  const boxes: WeldedBox[] = present.map((id) => ({ id, rect: glueChromeRect(next[id]!) }))
  const moved = compactWeldedCluster(boxes, anchorIds.filter((id) => next[id]))
  if (moved.size === 0) return next
  const compacted = { ...next }
  for (const [id, corner] of moved) {
    const w = compacted[id]!
    // Compaction answers in chrome-box corners; hand each member back the
    // headroom that was added so the stored position stays the card's own.
    const head = widgetShowsTitleRow(w, { glued: true }) ? WIDGET_TITLE_ROW : 0
    compacted[id] = { ...w, position: { x: corner.x, y: corner.y + head } }
  }
  return compacted
}

/**
 * Push the members of a just-dissolved cluster apart so the split is physical:
 * every card ends a full clear cell from its old clustermates, snapped back to
 * the grid. Without this, ungrouping deleted the record but left the cards
 * stored touching — still reading, and through settling still behaving, like
 * one welded object. Reuses the weld reflow with each box grown by half a cell
 * per side, so members separate along the axis they were arranged on. Pure;
 * returns the same reference when nothing had to move.
 */
export function spreadClusterMembers(
  widgets: Record<string, Widget>,
  memberIds: readonly string[],
): Record<string, Widget> {
  const present = memberIds.filter((id) => widgets[id])
  if (present.length < 2) return widgets
  const pad = GRID_SIZE / 2
  const boxes: WeldedBox[] = present.map((id) => {
    const box = glueBoxRect(widgets[id]!)
    return {
      id,
      rect: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
    }
  })
  const moved = reflowWeldedCluster(boxes, [])
  if (moved.size === 0) return widgets
  const next = { ...widgets }
  for (const [id, corner] of moved) {
    const w = next[id]!
    next[id] = { ...w, position: { x: snapToGrid(corner.x + pad), y: snapToGrid(corner.y + pad) } }
  }
  return next
}

/**
 * Re-derive every glue cluster from what actually touches on the board. A
 * cluster is only ever a set of members with no memory of which cards sit
 * against which, so a member dragged away and re-welded elsewhere, or the
 * middle card of a row deleted, can leave a single record whose pieces float
 * apart with no seam between them yet still drag as one. This splits any such
 * record into its connected components; a component of one is no longer a
 * cluster and is dropped. The first surviving component keeps the original id
 * (stable undo, preview, and index identity); extra components get fresh ids.
 * Returns the same reference when nothing changed, so callers can skip a
 * needless state write.
 */
export function reconcileGlueClusters(
  widgets: Record<string, Widget>,
  glues: Record<string, WidgetGlue>,
  makeId: () => string = () => crypto.randomUUID(),
): Record<string, WidgetGlue> {
  const next: Record<string, WidgetGlue> = {}
  let changed = false
  for (const [glueId, glue] of Object.entries(glues)) {
    const components = connectedGlueComponents(glue.widgetIds, widgets).filter(
      (component) => component.length >= 2,
    )
    // Untouched: one whole component that still holds every stored member.
    if (components.length === 1 && components[0]!.length === glue.widgetIds.length) {
      next[glueId] = glue
      continue
    }
    changed = true
    components.forEach((component, index) => {
      if (index === 0) next[glueId] = { ...glue, widgetIds: component }
      else {
        const id = makeId()
        next[id] = { id, widgetIds: component }
      }
    })
  }
  return changed ? next : glues
}
