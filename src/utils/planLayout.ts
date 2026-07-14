import type { Vector2D } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { GROUP_PAD } from './groupGeometry'
import type { ThoughtPlan } from './thoughtInterpreter'

/**
 * Tidy-tree layout for a ThoughtPlan at commit time.
 *
 * Plans arrive as a graph (nodes + parent relations + groups); this turns
 * them into positions that read as a drawn mindmap instead of a grid dump:
 *
 * - Parent edges define an org-chart tree: children in a row under their
 *   parent, each parent centered over its children, subtrees never
 *   overlapping (classic tidy-tree width accumulation).
 * - A plan group (host + attachments) is ONE layout block: members sit in a
 *   horizontal strip exactly one grid cell apart — the magnet arrangement —
 *   and the whole block reserves GROUP_PAD air for its band.
 * - Rows are sized by the tallest block at that depth, with enough gap for
 *   relation curves and the floating band pills.
 *
 * Pure math over the plan — the caller applies the offsets to a world
 * origin. Every returned coordinate is grid-snapped.
 */

export interface PlanNodeSize {
  width: number
  height: number
}

const SIBLING_GAP = GRID_SIZE * 2
const ROOT_GAP = GRID_SIZE * 4
const ROW_GAP = GRID_SIZE * 3
const MEMBER_GAP = GRID_SIZE

export function layoutThoughtPlan(
  plan: ThoughtPlan,
  sizes: Record<string, PlanNodeSize>,
): Record<string, Vector2D> {
  const sizeOf = (id: string): PlanNodeSize => sizes[id] ?? { width: 320, height: 160 }

  // --- Blocks: a grouped host absorbs its co-members into one strip -------
  const strip = new Map<string, string[]>()
  const absorbed = new Set<string>()
  for (const group of plan.groups) {
    const [host, ...rest] = group.memberTemporaryIds
    if (!host || rest.length === 0 || absorbed.has(host)) continue
    const members = rest.filter((id) => !absorbed.has(id) && id !== host)
    if (members.length === 0) continue
    strip.set(host, members)
    for (const id of members) absorbed.add(id)
  }

  const blockSize = (id: string): PlanNodeSize => {
    const members = [id, ...(strip.get(id) ?? [])]
    const width = members.reduce((total, member) => total + sizeOf(member).width, 0) +
      (members.length - 1) * MEMBER_GAP
    const height = Math.max(...members.map((member) => sizeOf(member).height))
    const pad = members.length > 1 ? GROUP_PAD : 0
    return { width: width + pad * 2, height: height + pad * 2 }
  }

  // --- Tree assembly --------------------------------------------------------
  const nodeIds = plan.nodes.map((node) => node.temporaryId)
  const inPlan = new Set(nodeIds)
  const childrenOf = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const relation of plan.relations) {
    if (relation.type !== 'parent') continue
    const from = relation.fromTemporaryId
    const to = relation.toTemporaryId
    if (!inPlan.has(from) || !inPlan.has(to)) continue
    if (absorbed.has(from) || absorbed.has(to)) continue
    if (hasParent.has(to) || from === to) continue
    hasParent.add(to)
    const list = childrenOf.get(from)
    if (list) list.push(to)
    else childrenOf.set(from, [to])
  }
  const roots = nodeIds.filter((id) => !absorbed.has(id) && !hasParent.has(id))

  // --- Subtree widths (memoized, cycle-guarded) -----------------------------
  const widths = new Map<string, number>()
  const measuring = new Set<string>()
  const subtreeWidth = (id: string): number => {
    const cached = widths.get(id)
    if (cached !== undefined) return cached
    if (measuring.has(id)) return blockSize(id).width
    measuring.add(id)
    const kids = childrenOf.get(id) ?? []
    const own = blockSize(id).width
    const kidsWidth = kids.reduce((total, kid) => total + subtreeWidth(kid), 0) +
      Math.max(0, kids.length - 1) * SIBLING_GAP
    const width = Math.max(own, kidsWidth)
    measuring.delete(id)
    widths.set(id, width)
    return width
  }

  // --- Depth rows ------------------------------------------------------------
  const depthOf = new Map<string, number>()
  const stack: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }))
  while (stack.length) {
    const { id, depth } = stack.pop()!
    if (depthOf.has(id)) continue
    depthOf.set(id, depth)
    for (const kid of childrenOf.get(id) ?? []) stack.push({ id: kid, depth: depth + 1 })
  }
  const rowHeights: number[] = []
  for (const [id, depth] of depthOf) {
    rowHeights[depth] = Math.max(rowHeights[depth] ?? 0, blockSize(id).height)
  }
  const rowTops: number[] = []
  let runningTop = 0
  rowHeights.forEach((height, depth) => {
    rowTops[depth] = runningTop
    runningTop += height + ROW_GAP
  })

  // --- Placement ---------------------------------------------------------------
  const positions: Record<string, Vector2D> = {}
  const placeBlock = (id: string, left: number, width: number) => {
    const depth = depthOf.get(id) ?? 0
    const block = blockSize(id)
    const members = [id, ...(strip.get(id) ?? [])]
    const pad = members.length > 1 ? GROUP_PAD : 0
    const rowHeight = rowHeights[depth] ?? block.height
    const blockLeft = left + (width - block.width) / 2
    // Blocks top-align within the row; members center within the block.
    const blockTop = (rowTops[depth] ?? 0) + (rowHeight - block.height) / 2
    let x = blockLeft + pad
    for (const member of members) {
      const size = sizeOf(member)
      positions[member] = {
        x: snapToGrid(x),
        y: snapToGrid(blockTop + pad + (block.height - pad * 2 - size.height) / 2),
      }
      x += size.width + MEMBER_GAP
    }
  }

  const placed = new Set<string>()
  const placeSubtree = (id: string, left: number) => {
    if (placed.has(id)) return
    placed.add(id)
    const width = subtreeWidth(id)
    placeBlock(id, left, width)
    const kids = childrenOf.get(id) ?? []
    if (kids.length === 0) return
    const kidsWidth = kids.reduce((total, kid) => total + subtreeWidth(kid), 0) +
      Math.max(0, kids.length - 1) * SIBLING_GAP
    let cursor = left + (width - kidsWidth) / 2
    for (const kid of kids) {
      placeSubtree(kid, cursor)
      cursor += subtreeWidth(kid) + SIBLING_GAP
    }
  }

  let rootCursor = 0
  for (const root of roots) {
    placeSubtree(root, rootCursor)
    rootCursor += subtreeWidth(root) + ROOT_GAP
  }

  // Anything unreachable (absorbed members are placed with their host; this
  // catches malformed leftovers) lines up in a final row below the tree.
  let orphanX = 0
  const orphanTop = runningTop
  for (const id of nodeIds) {
    if (positions[id]) continue
    const size = sizeOf(id)
    positions[id] = { x: snapToGrid(orphanX), y: snapToGrid(orphanTop) }
    orphanX += size.width + SIBLING_GAP
  }

  return positions
}

/** Width of the laid-out plan — callers use it to center the tree. */
export function layoutWidth(
  positions: Record<string, Vector2D>,
  sizes: Record<string, PlanNodeSize>,
): number {
  let minX = Infinity
  let maxX = -Infinity
  for (const [id, position] of Object.entries(positions)) {
    minX = Math.min(minX, position.x)
    maxX = Math.max(maxX, position.x + (sizes[id]?.width ?? 320))
  }
  return Number.isFinite(minX) ? maxX - minX : 0
}
