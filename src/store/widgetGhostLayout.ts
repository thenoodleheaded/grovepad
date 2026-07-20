import type { GhostTreeNode } from '../types/spatial'
import { GHOST_PITCH_X, GHOST_PITCH_Y } from '../types/spatial'
import { ghostNodeGrid } from '../utils/ghostTreePresentation'

/** Tidy-forest layout with subtree-width reservation. Top-level siblings and
 * their independent branches yield enough space to one another, while the
 * original order-zero root stays centered on the shaping origin. */
export function layoutGhostTree(
  source: GhostTreeNode[],
  originX: number,
  originY: number,
): GhostTreeNode[] {
  const nodes = source.map((node) => ({ ...node }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string, GhostTreeNode[]>()
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue
    const row = children.get(node.parentId)
    if (row) row.push(node)
    else children.set(node.parentId, [node])
  }
  for (const row of children.values()) row.sort((a, b) => a.order - b.order)
  const horizontalGap = GHOST_PITCH_X - 40
  const verticalGap = GHOST_PITCH_Y - 40
  const widths = new Map<string, number>()
  const depthById = new Map<string, number>()
  const maxHeightByDepth = new Map<number, number>()
  const measure = (node: GhostTreeNode): number => {
    const row = children.get(node.id) ?? []
    const ownWidth = ghostNodeGrid(node.widgetTypes.length).width
    const childrenWidth = row.length === 0
      ? 0
      : row.reduce((total, child) => total + measure(child), 0) + horizontalGap * (row.length - 1)
    const width = Math.max(ownWidth, childrenWidth)
    widths.set(node.id, width)
    return width
  }
  const roots = nodes
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.order - b.order)
  if (roots.length === 0) return nodes
  for (const root of roots) measure(root)
  const measureDepth = (node: GhostTreeNode, depth: number) => {
    depthById.set(node.id, depth)
    const height = ghostNodeGrid(node.widgetTypes.length).height
    maxHeightByDepth.set(depth, Math.max(maxHeightByDepth.get(depth) ?? 0, height))
    for (const child of children.get(node.id) ?? []) measureDepth(child, depth + 1)
  }
  for (const root of roots) measureDepth(root, 0)
  const yByDepth = new Map<number, number>()
  let nextY = originY
  const maxDepth = Math.max(...depthById.values())
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    yByDepth.set(depth, nextY)
    nextY += (maxHeightByDepth.get(depth) ?? 40) + verticalGap
  }

  const place = (node: GhostTreeNode, start: number) => {
    const width = widths.get(node.id) ?? 1
    const own = ghostNodeGrid(node.widgetTypes.length)
    const depth = depthById.get(node.id) ?? 0
    node.x = start + width / 2 - own.width / 2
    node.y = yByDepth.get(depth) ?? originY
    let cursor = start
    for (const child of children.get(node.id) ?? []) {
      place(child, cursor)
      cursor += (widths.get(child.id) ?? 1) + horizontalGap
    }
  }
  let rootCursor = 0
  for (const root of roots) {
    place(root, rootCursor)
    rootCursor += (widths.get(root.id) ?? 1) + horizontalGap
  }
  const anchorRoot = roots.find((root) => root.order === 0) ?? roots[0]!
  const rootWidth = ghostNodeGrid(anchorRoot.widgetTypes.length).width
  const shiftX = originX + 20 - (anchorRoot.x + rootWidth / 2)
  for (const node of nodes) node.x += shiftX
  return nodes
}

export const ghostGestureState: { base: GhostTreeNode[] | null } = { base: null }
export const ghostGestureIds = new Map<string, string>()

export function gestureGhostId(key: string): string {
  const existing = ghostGestureIds.get(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  ghostGestureIds.set(key, id)
  return id
}
