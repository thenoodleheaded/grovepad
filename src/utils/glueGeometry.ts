import { GRID_SIZE, snapToGrid, type Vector2D, type Widget, type WidgetGlue } from '../types/spatial'
import type { WorldRect } from './canvasView'
import { isWidgetResting, restingTileSize } from './widgetRest'

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

/** Seams wider than this no longer render a weld: the cards have visibly come
 * apart (content growth, manual nudge) even though the bond persists. */
const GLUE_SEAM_MAX = Math.round(GRID_SIZE * 0.75) // 30

/** The box a glued widget visually occupies: its resting tile while it rests,
 * otherwise its stored card. Welds hug what the eye sees, not dormant sizes. */
export function glueBoxRect(widget: Widget): WorldRect {
  const box = isWidgetResting(widget, { expandedWidgetId: null })
    ? restingTileSize(widget)
    : widget.size
  return { x: widget.position.x, y: widget.position.y, width: box.width, height: box.height }
}

export interface GlueSeam {
  aId: string
  bId: string
  /** Which axis separates the pair: 'x' = side by side, 'y' = stacked,
   * 'corner' = diagonal neighbours (the elbow of an L or the heart of a 2×2). */
  axis: 'x' | 'y' | 'corner'
  /** The gap area between the two facing edges, in world space. */
  rect: WorldRect
  /** Gradient direction: 'a' sits before 'b' along the axis (left/top). */
  aFirst: boolean
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

/**
 * The weld between one pair of boxes, if they are close enough to wear one.
 * Side by side (facing edges within `maxGap`, sharing real perpendicular
 * overlap) yields a straight bar seam; diagonal neighbours (small clear air on
 * BOTH axes) yield a corner patch — the piece that fills the elbow of an
 * L-arrangement and the centre of a 2×2 square.
 */
export function glueSeamBetween(
  aId: string,
  a: WorldRect,
  bId: string,
  b: WorldRect,
  maxGap: number = GLUE_SEAM_MAX,
): GlueSeam | null {
  const { gapX, gapY, overlapX, overlapY } = edgeGaps(a, b)

  if (gapX > 0 && gapX <= maxGap && overlapY >= GLUE_MIN_OVERLAP) {
    const aFirst = a.x <= b.x
    return {
      aId,
      bId,
      axis: 'x',
      aFirst,
      rect: {
        x: Math.min(a.x + a.width, b.x + b.width),
        y: Math.max(a.y, b.y),
        width: gapX,
        height: overlapY,
      },
    }
  }

  if (gapY > 0 && gapY <= maxGap && overlapX >= GLUE_MIN_OVERLAP) {
    const aFirst = a.y <= b.y
    return {
      aId,
      bId,
      axis: 'y',
      aFirst,
      rect: {
        x: Math.max(a.x, b.x),
        y: Math.min(a.y + a.height, b.y + b.height),
        width: overlapX,
        height: gapY,
      },
    }
  }

  if (gapX > 0 && gapY > 0 && gapX <= maxGap && gapY <= maxGap) {
    return {
      aId,
      bId,
      axis: 'corner',
      aFirst: a.x <= b.x,
      rect: {
        x: Math.min(a.x + a.width, b.x + b.width),
        y: Math.min(a.y + a.height, b.y + b.height),
        width: gapX,
        height: gapY,
      },
    }
  }

  return null
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
 * Every weld a glue cluster shows: one straight seam per facing pair, one
 * corner patch per diagonal pair, computed from the members' INSET boxes so
 * each seam sits in the gap carved from both cards. Together they trace the
 * shape of the merge — a bar for a row, an elbow for an L, a filled heart for
 * a 2×2 — without any backplate behind the cards.
 */
export function glueSeamsForCluster(
  widgetIds: readonly string[],
  widgets: Record<string, Widget>,
  maxGap: number = GLUE_SEAM_MAX,
): GlueSeam[] {
  const rects = insetGlueRects(widgetIds, widgets)
  const ids = [...rects.keys()]
  const seams: GlueSeam[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const seam = glueSeamBetween(ids[i]!, rects.get(ids[i]!)!, ids[j]!, rects.get(ids[j]!)!, maxGap)
      if (seam) seams.push(seam)
    }
  }
  return seams
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
        if (glueSeparation(boxes.get(current)!, boxes.get(other)!) <= GLUE_RANGE) {
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
