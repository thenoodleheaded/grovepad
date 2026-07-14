import type { GhostTreeNode } from '../types/spatial'
import { GHOST_PITCH_X, GHOST_PITCH_Y } from '../types/spatial'

/** Tidy-tree layout with subtree-width reservation. Leaves occupy one pitch;
 * parents center over their complete child span, so adding any branch makes
 * neighboring subtrees yield enough space instead of crossing or stacking. */
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
  const widths = new Map<string, number>()
  const measure = (node: GhostTreeNode): number => {
    const row = children.get(node.id) ?? []
    const width = row.length === 0
      ? 1
      : row.reduce((total, child) => total + measure(child), 0)
    widths.set(node.id, width)
    return width
  }
  const root = nodes.find((node) => node.parentId === null)
  if (!root) return nodes
  measure(root)
  const place = (node: GhostTreeNode, start: number, depth: number) => {
    const width = widths.get(node.id) ?? 1
    node.x = (start + width / 2) * GHOST_PITCH_X
    node.y = originY + depth * GHOST_PITCH_Y
    let cursor = start
    for (const child of children.get(node.id) ?? []) {
      place(child, cursor, depth + 1)
      cursor += widths.get(child.id) ?? 1
    }
  }
  place(root, 0, 0)
  const shiftX = originX - root.x
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
