import type { Vector2D } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import { clamp } from './math'

/**
 * Card-to-card line geometry — the single owner of where a relation or
 * dependency line touches a widget and how it travels between two of them.
 *
 * Three rules define every route:
 *
 * 1. **The standoff.** A line stops exactly 0.3 of a grid cell short of the
 *    card it points at — the same seam a glue weld carves — so the stroke
 *    never merges into the glass edge.
 * 2. **The closest facing pair.** Each end slides along its own border to the
 *    point nearest the other card, on a side that actually faces it. Lines
 *    never all sprout from one card's middle, and never leave a card heading
 *    away from their destination.
 * 3. **One cubic, tangent to both borders.** A route is a single curve whose
 *    ends leave straight out of the borders they touch. When the two landing
 *    points line up — which the anchor solver actively prefers — the control
 *    points are colinear and the "curve" renders as a dead-straight line.
 *    There is no escape segment and no middle section, so there is no join
 *    that can kink or double back.
 */

/** Gap between a card's border and any line touching it: 0.3 cell. */
export const LINE_STANDOFF = GRID_SIZE * 0.3
/** How far a landing point stays clear of a card's rounded corner. */
const CORNER_INSET = GRID_SIZE * 0.6
/** Breathing room left around a floating name capsule a line has to dodge. */
const PILL_CLEARANCE = LINE_STANDOFF
/** Tangent lengths. Half the forward run keeps an offset pair reading as one
 *  gentle S; the floor keeps a very short hop from looking snapped straight,
 *  the ceiling keeps a long haul from ballooning. */
const MIN_REACH = GRID_SIZE * 0.4
const MAX_REACH = GRID_SIZE * 3.5
/** A side that would send the line backwards is effectively disqualified. */
const BACKTRACK_COST = 1_000_000
/** Mild preference for two facing sides over a corner turn... */
const TURN_COST = GRID_SIZE * 1.5
/** ...and a stronger one for a landing pair that renders perfectly straight. */
const STRAIGHT_BONUS = GRID_SIZE * 2
/** Below this the two anchors count as aligned on the perpendicular axis. */
const STRAIGHT_EPS = 0.5

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Which half of a node's border an endpoint may attach to. `lower`/`upper`
 * carry the strict-hold reading: a strict parent hands the line off from its
 * bottom half and the child takes it into its upper half, so a held family
 * reads top-down at a glance.
 */
export type EdgeAttach = 'free' | 'lower' | 'upper'

/** A floating name capsule, in world coordinates, that a line must not land
 *  underneath. Reached as `EdgeNode['pill']` rather than by name. */
interface EdgePill {
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface EdgeNode {
  center: Vector2D
  halfW: number
  halfH: number
  pill?: EdgePill | null
}

export interface EdgeRoute {
  /** SVG path `d` — always exactly one cubic. */
  d: string
  /** The curve point at t = 0.5, where chips pin. */
  mid: Vector2D
  start: Vector2D
  end: Vector2D
  startSide: EdgeSide
  endSide: EdgeSide
}

const NORMAL: Record<EdgeSide, Vector2D> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<EdgeSide, EdgeSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

const ALL_SIDES: readonly EdgeSide[] = ['top', 'bottom', 'left', 'right']
const LOWER_SIDES: readonly EdgeSide[] = ['bottom', 'left', 'right']
const UPPER_SIDES: readonly EdgeSide[] = ['top', 'left', 'right']

/** A node's border pushed out by the standoff — every landing point lives on
 *  this box, so the gap to the card is the same on all four sides. */
interface Box {
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  cy: number
}

function standoffBox(node: EdgeNode): Box {
  return {
    left: node.center.x - node.halfW - LINE_STANDOFF,
    right: node.center.x + node.halfW + LINE_STANDOFF,
    top: node.center.y - node.halfH - LINE_STANDOFF,
    bottom: node.center.y + node.halfH + LINE_STANDOFF,
    cx: node.center.x,
    cy: node.center.y,
  }
}

function sidesFor(attach: EdgeAttach): readonly EdgeSide[] {
  if (attach === 'lower') return LOWER_SIDES
  if (attach === 'upper') return UPPER_SIDES
  return ALL_SIDES
}

function isVertical(side: EdgeSide): boolean {
  return side === 'top' || side === 'bottom'
}

function sideCoord(box: Box, side: EdgeSide): number {
  switch (side) {
    case 'top': return box.top
    case 'bottom': return box.bottom
    case 'left': return box.left
    case 'right': return box.right
  }
}

/**
 * The stretch of one side a line may land on: held back from both corners,
 * and halved again when a strict hold pins the endpoint to the bottom or the
 * top half of the card.
 */
function landingRange(box: Box, side: EdgeSide, attach: EdgeAttach): [number, number] {
  const halfW = (box.right - box.left) / 2
  const halfH = (box.bottom - box.top) / 2
  const inset = Math.max(0, Math.min(CORNER_INSET, halfW - 1, halfH - 1))
  if (isVertical(side)) return [box.left + inset, box.right - inset]

  let min = box.top + inset
  let max = box.bottom - inset
  if (attach === 'lower') min = Math.max(min, box.cy)
  if (attach === 'upper') max = Math.min(max, box.cy)
  // A card small enough for its corner insets to swallow the allowed half
  // still needs somewhere to land: the halfway line itself.
  if (min > max) return [box.cy, box.cy]
  return [min, max]
}

/**
 * Both landing points at once, rather than each chasing the other's center.
 * When the two sides slide on the SAME axis and their ranges overlap, both
 * land on one shared coordinate — that is what makes a child sitting under
 * its parent draw a perfectly straight line instead of a slight lean.
 */
function pairAnchors(
  a: Box, sideA: EdgeSide, attachA: EdgeAttach,
  b: Box, sideB: EdgeSide, attachB: EdgeAttach,
): { start: Vector2D; end: Vector2D } {
  const verticalA = isVertical(sideA)
  const verticalB = isVertical(sideB)
  const [aMin, aMax] = landingRange(a, sideA, attachA)
  const [bMin, bMax] = landingRange(b, sideB, attachB)
  const aFixed = sideCoord(a, sideA)
  const bFixed = sideCoord(b, sideB)

  if (verticalA === verticalB) {
    const aTarget = verticalA ? b.cx : b.cy
    const bTarget = verticalA ? a.cx : a.cy
    const low = Math.max(aMin, bMin)
    const high = Math.min(aMax, bMax)
    let aFree: number
    let bFree: number
    if (low <= high) {
      const shared = clamp((aTarget + bTarget) / 2, low, high)
      aFree = shared
      bFree = shared
    } else {
      aFree = clamp(aTarget, aMin, aMax)
      bFree = clamp(bTarget, bMin, bMax)
    }
    return verticalA
      ? { start: { x: aFree, y: aFixed }, end: { x: bFree, y: bFixed } }
      : { start: { x: aFixed, y: aFree }, end: { x: bFixed, y: bFree } }
  }

  // Mixed axes (a corner turn): each end simply slides toward the other card.
  return {
    start: verticalA
      ? { x: clamp(b.cx, aMin, aMax), y: aFixed }
      : { x: aFixed, y: clamp(b.cy, aMin, aMax) },
    end: verticalB
      ? { x: clamp(a.cx, bMin, bMax), y: bFixed }
      : { x: bFixed, y: clamp(a.cy, bMin, bMax) },
  }
}

/**
 * A widget's name capsule floats clear of its box, so a line landing on the
 * top border would otherwise stop underneath it. Slide the landing point
 * along its own border until it clears the capsule — the capsule is
 * left-aligned with the card, so there is nearly always room on the far side.
 * Only when the capsule covers the whole border does the point step outward
 * past it instead.
 */
function dodgePill(
  point: Vector2D,
  side: EdgeSide,
  range: readonly [number, number],
  pill: EdgePill | null | undefined,
): Vector2D {
  if (!pill) return point
  const rx = pill.rx + PILL_CLEARANCE
  const ry = pill.ry + PILL_CLEARANCE
  if (Math.abs(point.x - pill.cx) > rx || Math.abs(point.y - pill.cy) > ry) return point

  const [min, max] = range
  if (isVertical(side)) {
    const past = pill.cx + rx
    const before = pill.cx - rx
    if (past <= max) return { x: past, y: point.y }
    if (before >= min) return { x: before, y: point.y }
    return {
      x: point.x,
      y: side === 'top' ? Math.min(point.y, pill.cy - ry) : Math.max(point.y, pill.cy + ry),
    }
  }
  const below = pill.cy + ry
  const above = pill.cy - ry
  if (below <= max) return { x: point.x, y: below }
  if (above >= min) return { x: point.x, y: above }
  return {
    x: side === 'left' ? Math.min(point.x, pill.cx - rx) : Math.max(point.x, pill.cx + rx),
    y: point.y,
  }
}

function dot(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y
}

function routeCost(start: Vector2D, sideA: EdgeSide, end: Vector2D, sideB: EdgeSide): number {
  const span = { x: end.x - start.x, y: end.y - start.y }
  let cost = Math.hypot(span.x, span.y)
  if (dot(span, NORMAL[sideA]) <= 0) cost += BACKTRACK_COST
  if (dot({ x: -span.x, y: -span.y }, NORMAL[sideB]) <= 0) cost += BACKTRACK_COST
  if (sideB !== OPPOSITE[sideA]) {
    cost += TURN_COST
  } else {
    const drift = isVertical(sideA) ? Math.abs(span.x) : Math.abs(span.y)
    if (drift < STRAIGHT_EPS) cost -= STRAIGHT_BONUS
  }
  return cost
}

/** How far a control point reaches out of its border. */
function tangentReach(span: Vector2D, normal: Vector2D): number {
  const forward = dot(span, normal)
  const lateral = Math.abs(span.x * normal.y - span.y * normal.x)
  // Half the forward run and nothing else: two facing ends meet in the middle,
  // a pair that lines up renders dead straight, and a steep climb keeps its
  // turn close to the card. Padding this with a share of the sideways run was
  // tried and reads worse — the line then runs flat past its own card before
  // hooking away.
  if (forward > 0) return clamp(forward * 0.5, MIN_REACH, MAX_REACH)
  // The other end sits behind this border — only reachable when a strict hold
  // or a fixed rail pins the side. Bow out by a fraction of the sideways run
  // rather than looping.
  return clamp(lateral * 0.22, MIN_REACH, MAX_REACH)
}

function controlPoints(
  start: Vector2D, startSide: EdgeSide,
  end: Vector2D, endSide: EdgeSide,
): { c1: Vector2D; c2: Vector2D } {
  const span = { x: end.x - start.x, y: end.y - start.y }
  const back = { x: -span.x, y: -span.y }
  const startNormal = NORMAL[startSide]
  const endNormal = NORMAL[endSide]
  const startReach = tangentReach(span, startNormal)
  const endReach = tangentReach(back, endNormal)
  return {
    c1: { x: start.x + startNormal.x * startReach, y: start.y + startNormal.y * startReach },
    c2: { x: end.x + endNormal.x * endReach, y: end.y + endNormal.y * endReach },
  }
}

/** SVG path for a line that leaves `startSide` and enters `endSide`. */
export function edgePath(
  start: Vector2D, startSide: EdgeSide,
  end: Vector2D, endSide: EdgeSide,
): string {
  const { c1, c2 } = controlPoints(start, startSide, end, endSide)
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`
}

/** The same line's exact halfway point — where a status chip pins. */
export function edgeMidpoint(
  start: Vector2D, startSide: EdgeSide,
  end: Vector2D, endSide: EdgeSide,
): Vector2D {
  const { c1, c2 } = controlPoints(start, startSide, end, endSide)
  // A cubic at t = 0.5 reduces to the endpoints plus 3× each control point,
  // over 8.
  return {
    x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
    y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
  }
}

/**
 * The whole route between two cards: pick the cheapest facing pair of sides,
 * land both ends a standoff clear of the borders, and connect them with one
 * cubic. `attach` applies the strict-hold halves.
 */
export function routeEdge(
  from: EdgeNode,
  to: EdgeNode,
  attach?: { from?: EdgeAttach; to?: EdgeAttach },
): EdgeRoute {
  const attachFrom = attach?.from ?? 'free'
  const attachTo = attach?.to ?? 'free'
  const a = standoffBox(from)
  const b = standoffBox(to)

  let best:
    | { cost: number; start: Vector2D; end: Vector2D; startSide: EdgeSide; endSide: EdgeSide }
    | null = null
  for (const sideA of sidesFor(attachFrom)) {
    for (const sideB of sidesFor(attachTo)) {
      const raw = pairAnchors(a, sideA, attachFrom, b, sideB, attachTo)
      const start = dodgePill(raw.start, sideA, landingRange(a, sideA, attachFrom), from.pill)
      const end = dodgePill(raw.end, sideB, landingRange(b, sideB, attachTo), to.pill)
      const cost = routeCost(start, sideA, end, sideB)
      if (!best || cost < best.cost) best = { cost, start, end, startSide: sideA, endSide: sideB }
    }
  }
  // Every attach rule offers at least three sides per end, so a best route
  // always exists; the fallback only satisfies the type.
  const route = best ?? {
    start: from.center,
    end: to.center,
    startSide: 'bottom' as EdgeSide,
    endSide: 'top' as EdgeSide,
  }
  return {
    d: edgePath(route.start, route.startSide, route.end, route.endSide),
    mid: edgeMidpoint(route.start, route.startSide, route.end, route.endSide),
    start: route.start,
    end: route.end,
    startSide: route.startSide,
    endSide: route.endSide,
  }
}

/**
 * A line from a card to a loose point — the cmd-drag link preview. It leaves
 * the card's border by the same rules a committed relation does, so the
 * preview starts where the real line will, and runs straight into the cursor.
 */
export function routeEdgeToPoint(from: EdgeNode, point: Vector2D): string {
  const box = standoffBox(from)
  let best: { cost: number; start: Vector2D; side: EdgeSide } | null = null
  for (const side of ALL_SIDES) {
    const [min, max] = landingRange(box, side, 'free')
    const fixed = sideCoord(box, side)
    const raw = isVertical(side)
      ? { x: clamp(point.x, min, max), y: fixed }
      : { x: fixed, y: clamp(point.y, min, max) }
    const start = dodgePill(raw, side, [min, max], from.pill)
    const span = { x: point.x - start.x, y: point.y - start.y }
    const cost = Math.hypot(span.x, span.y) + (dot(span, NORMAL[side]) <= 0 ? BACKTRACK_COST : 0)
    if (!best || cost < best.cost) best = { cost, start, side }
  }
  const { start, side } = best ?? { start: from.center, side: 'bottom' as EdgeSide }
  const span = { x: point.x - start.x, y: point.y - start.y }
  const normal = NORMAL[side]
  const reach = tangentReach(span, normal)
  const c1 = { x: start.x + normal.x * reach, y: start.y + normal.y * reach }
  const length = Math.hypot(span.x, span.y) || 1
  const trail = clamp(length * 0.35, MIN_REACH, MAX_REACH)
  const c2 = { x: point.x - (span.x / length) * trail, y: point.y - (span.y / length) * trail }
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${point.x} ${point.y}`
}
