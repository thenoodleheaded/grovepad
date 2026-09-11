import type { Relation, Widget } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import { GLUE_FRAME_BAND, GLUE_TITLE_HEADROOM } from '../utils/glueGeometry'
import { restingFootprintWidget, WIDGET_TITLE_ROW, widgetShowsTitleRow } from '../utils/widgetRest'
import { settleWidgetLayout, type SettleOptions } from './widgetSettling'

/**
 * The generation floor — the height half of the parenting law, applied to every
 * node on the board rather than only to the ones the Untangle button rearranged.
 *
 * ONE rule: a child never rests as high as its parent. Its top edge lands at
 * least `GENERATION_GAP` below the parent's bottom edge, so a family always
 * reads top-down — parent row, gap, child row — no matter where the cards were
 * dropped. Arrangement stays free-form in every other respect: nothing is
 * centred, no sibling is lined up, and nothing is ever pulled UP or sideways.
 * This pass only ever pushes a card down, and only the exact distance the rule
 * asks for.
 *
 * What counts as one node is what counts as one node everywhere else: a glue
 * cluster is a single rigid unit measured with its frame band and title
 * headroom, every other widget is its own unit measured with its own floating
 * title row — the same boxes the settle pass separates, so the two passes agree
 * about where a card ends. A pushed node takes its whole parent-linked subtree
 * with it, so tightening the top of a tree never shuffles the shape below it.
 * Locked cards are never moved, and parent cycles are bounded by a pass limit
 * instead of hanging.
 */

/** Two cells, the same generation gap the tree compaction lays down. */
export const GENERATION_GAP = GRID_SIZE * 2

/** Cycles cannot converge, so the sweep is bounded rather than open-ended. */
const FLOOR_PASS_LIMIT = 8

interface Unit {
  key: string
  ids: string[]
  /** True when any member is locked: the unit holds its ground. */
  locked: boolean
}

function unitKeyFor(id: string, glueIndex: Record<string, string>): string {
  const glueId = glueIndex[id]
  return glueId ? `g:${glueId}` : `w:${id}`
}

/** The visible vertical extent of one unit, measured exactly as the settle
 * pass measures it: resting tile, the floating title row a card paints above
 * its own box, and a cluster's frame band and name row. */
function verticalSpan(
  unit: Unit,
  widgets: Record<string, Widget>,
  positions: Record<string, { x: number; y: number }>,
): { top: number; bottom: number } {
  const isCluster = unit.key.startsWith('g:') && unit.ids.length > 1
  let top = Infinity
  let bottom = -Infinity
  for (const id of unit.ids) {
    const widget = widgets[id]!
    const y = positions[id]!.y
    const head = widgetShowsTitleRow(widget, { glued: isCluster }) ? WIDGET_TITLE_ROW : 0
    top = Math.min(top, y - head)
    bottom = Math.max(bottom, y + restingFootprintWidget(widget).size.height)
  }
  if (isCluster) {
    top -= GLUE_TITLE_HEADROOM
    bottom += GLUE_FRAME_BAND
  }
  return { top, bottom }
}

/**
 * Push every parent-linked child down until it clears its parent by a full
 * generation. Returns the same record when the board already obeys the rule, so
 * callers can keep their no-op checks.
 */
export function enforceGenerationFloor(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  glueIndex: Record<string, string> = {},
): Record<string, Widget> {
  const units = new Map<string, Unit>()
  const unitOf = new Map<string, string>()
  for (const widget of Object.values(widgets)) {
    const key = unitKeyFor(widget.id, glueIndex)
    unitOf.set(widget.id, key)
    const unit = units.get(key)
    if (unit) {
      unit.ids.push(widget.id)
      unit.locked ||= widget.metadata.locked === true
    } else {
      units.set(key, { key, ids: [widget.id], locked: widget.metadata.locked === true })
    }
  }

  // Parent edges BETWEEN units, on one canvas. An edge inside a single unit
  // says nothing about generations — those two cards are one welded object.
  const edges: Array<{ parent: string; child: string }> = []
  const childUnits = new Map<string, string[]>()
  const seen = new Set<string>()
  for (const relation of Object.values(relations)) {
    if (relation.type !== 'parent') continue
    const from = widgets[relation.fromId]
    const to = widgets[relation.toId]
    if (!from || !to || from.canvasId !== to.canvasId) continue
    const parent = unitOf.get(relation.fromId)!
    const child = unitOf.get(relation.toId)!
    if (parent === child) continue
    const key = `${parent}>${child}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ parent, child })
    const kids = childUnits.get(parent)
    if (kids) kids.push(child)
    else childUnits.set(parent, [child])
  }
  if (edges.length === 0) return widgets

  const positions: Record<string, { x: number; y: number }> = {}
  for (const widget of Object.values(widgets)) positions[widget.id] = widget.position

  /** A unit and everything hanging under it — a push carries the branch, so
   * the shape below the moved node survives untouched. Cycle-safe. */
  const branchOf = (start: string): string[] => {
    const collected: string[] = []
    const visited = new Set<string>([start])
    const queue = [start]
    while (queue.length > 0) {
      const key = queue.shift()!
      collected.push(key)
      for (const kid of childUnits.get(key) ?? []) {
        if (visited.has(kid)) continue
        visited.add(kid)
        queue.push(kid)
      }
    }
    return collected
  }

  let moved = false
  for (let pass = 0; pass < FLOOR_PASS_LIMIT; pass += 1) {
    let pushedThisPass = false
    for (const { parent, child } of edges) {
      const parentUnit = units.get(parent)!
      const childUnit = units.get(child)!
      if (childUnit.locked) continue
      const floor = verticalSpan(parentUnit, widgets, positions).bottom + GENERATION_GAP
      const childTop = verticalSpan(childUnit, widgets, positions).top
      const delta = floor - childTop
      if (delta <= 0) continue
      for (const key of branchOf(child)) {
        const unit = units.get(key)!
        if (unit.locked) continue
        for (const id of unit.ids) {
          positions[id] = { x: positions[id]!.x, y: positions[id]!.y + delta }
        }
      }
      pushedThisPass = true
      moved = true
    }
    if (!pushedThisPass) break
  }
  if (!moved) return widgets

  const next: Record<string, Widget> = { ...widgets }
  for (const widget of Object.values(widgets)) {
    const position = positions[widget.id]!
    if (position.y === widget.position.y) continue
    next[widget.id] = { ...widget, position }
  }
  return next
}

/**
 * The one legal-layout commit: clear overlaps, then drop every child clear of
 * its parent, then clear whatever that push landed on — holding the pushed
 * cards where the rule put them, so the second separation gives way around them
 * instead of undoing them.
 */
export function settleWithGenerationFloor(
  widgets: Record<string, Widget>,
  activeIds: string[],
  glueIndex: Record<string, string>,
  relations: Record<string, Relation>,
  options?: SettleOptions,
): Record<string, Widget> {
  const settled = settleWidgetLayout(widgets, activeIds, glueIndex, options)
  const floored = enforceGenerationFloor(settled, relations, glueIndex)
  if (floored === settled) return settled
  const pushed = Object.keys(floored).filter((id) => floored[id] !== settled[id])
  return settleWidgetLayout(floored, pushed, glueIndex, {
    anchorIds: [...(options?.anchorIds ?? []), ...pushed],
  })
}
