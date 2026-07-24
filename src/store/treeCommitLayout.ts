import type { Size, Vector2D } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { TREE_CLUSTER_GAP } from './widgetLayoutConstants'

// ---------------------------------------------------------------------------
// Committed tree-shaper layout.
//
// The shaper's ghost preview is drawn from small icon tiles, so its
// coordinates say nothing about how much room the real widgets need. Scaling
// those ghost coordinates by fixed multipliers (the previous approach) made
// bundles overlap, which then handed the whole board to the overlap-settling
// pass — and settling only guarantees "not overlapping", never "tidy". The
// result was a scattered forest.
//
// Instead this lays the tree out directly in world space from the real widget
// sizes, so the committed board is already correct and settling has nothing
// left to shove.
// ---------------------------------------------------------------------------

/** Horizontal breathing room between two sibling bundles' member bounds. Must
 * clear both plates' glass padding so neighbouring bundles never share a rim. */
export const TREE_SIBLING_GAP = GRID_SIZE * 3
/** Vertical room between a parent's members and its children's members: enough
 * for the parent plate's lower rim, the child bundle's floating name pill, and
 * the child cards' own title capsules above them. */
export const TREE_GENERATION_GAP = GRID_SIZE * 5

export interface TreeCommitNode {
  id: string
  parentId: string | null
  order: number
  /** Real widget sizes for this node, in the order they will be created. */
  widgetSizes: Size[]
}

export interface TreeCommitPlacement {
  nodeId: string
  /** Absolute world positions, index-aligned with the node's `widgetSizes`. */
  widgetPositions: Vector2D[]
}

interface ClusterLayout {
  width: number
  height: number
  /** Member offsets relative to the cluster's top-left. */
  offsets: Vector2D[]
}

/**
 * Packs one node's widgets into the same row grid a real group uses, so a
 * committed bundle already sits exactly where compaction would put it —
 * top-aligned, which keeps one flush plate rim and one line of title capsules.
 */
export function clusterLayout(sizes: readonly Size[]): ClusterLayout {
  if (sizes.length === 0) return { width: 0, height: 0, offsets: [] }
  const columns = Math.ceil(Math.sqrt(sizes.length))
  const rows: Size[][] = []
  const rowIndexOf: number[] = []
  for (let i = 0; i < sizes.length; i += 1) {
    const row = Math.floor(i / columns)
    if (!rows[row]) rows[row] = []
    rows[row]!.push(sizes[i]!)
    rowIndexOf.push(row)
  }

  const rowWidths = rows.map((row) =>
    row.reduce((total, size) => total + size.width, 0) + Math.max(0, row.length - 1) * TREE_CLUSTER_GAP,
  )
  const rowHeights = rows.map((row) => Math.max(...row.map((size) => size.height)))
  const width = Math.max(...rowWidths)
  const height =
    rowHeights.reduce((total, value) => total + value, 0) +
    Math.max(0, rows.length - 1) * TREE_CLUSTER_GAP

  const rowTops: number[] = []
  let y = 0
  for (const rowHeight of rowHeights) {
    rowTops.push(y)
    y += rowHeight + TREE_CLUSTER_GAP
  }

  const offsets: Vector2D[] = []
  const cursorByRow = rows.map((_, index) => (width - rowWidths[index]!) / 2)
  for (let i = 0; i < sizes.length; i += 1) {
    const row = rowIndexOf[i]!
    offsets.push({ x: cursorByRow[row]!, y: rowTops[row]! })
    cursorByRow[row] = cursorByRow[row]! + sizes[i]!.width + TREE_CLUSTER_GAP
  }
  return { width, height, offsets }
}

/**
 * Tidy-forest placement over real cluster footprints: every subtree reserves
 * its own width, so branches never grow into each other, and each generation
 * shares one baseline so sibling bundles read as a row.
 */
export function layoutCommittedTree(
  nodes: readonly TreeCommitNode[],
  originX: number,
  originY: number,
): TreeCommitPlacement[] {
  if (nodes.length === 0) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const clusters = new Map<string, ClusterLayout>(
    nodes.map((node) => [node.id, clusterLayout(node.widgetSizes)]),
  )
  const children = new Map<string, TreeCommitNode[]>()
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue
    const row = children.get(node.parentId)
    if (row) row.push(node)
    else children.set(node.parentId, [node])
  }
  for (const row of children.values()) row.sort((a, b) => a.order - b.order)

  // Subtree width reservation.
  const subtreeWidth = new Map<string, number>()
  const measure = (node: TreeCommitNode): number => {
    const row = children.get(node.id) ?? []
    const own = clusters.get(node.id)!.width
    const spread = row.length === 0
      ? 0
      : row.reduce((total, child) => total + measure(child), 0) + TREE_SIBLING_GAP * (row.length - 1)
    const width = Math.max(own, spread)
    subtreeWidth.set(node.id, width)
    return width
  }
  const roots = nodes.filter((node) => node.parentId === null || !byId.has(node.parentId))
    .sort((a, b) => a.order - b.order)
  if (roots.length === 0) return []
  for (const root of roots) measure(root)

  // One shared baseline per generation, sized by the tallest bundle in it.
  const depthOf = new Map<string, number>()
  const tallestByDepth = new Map<number, number>()
  const walkDepth = (node: TreeCommitNode, depth: number) => {
    depthOf.set(node.id, depth)
    tallestByDepth.set(depth, Math.max(tallestByDepth.get(depth) ?? 0, clusters.get(node.id)!.height))
    for (const child of children.get(node.id) ?? []) walkDepth(child, depth + 1)
  }
  for (const root of roots) walkDepth(root, 0)
  const topByDepth = new Map<number, number>()
  let cursorY = 0
  for (let depth = 0; depth <= Math.max(...depthOf.values()); depth += 1) {
    topByDepth.set(depth, cursorY)
    cursorY += (tallestByDepth.get(depth) ?? 0) + TREE_GENERATION_GAP
  }

  const clusterOrigin = new Map<string, Vector2D>()
  const place = (node: TreeCommitNode, start: number) => {
    const own = clusters.get(node.id)!
    const width = subtreeWidth.get(node.id)!
    // Centre each parent over the span its children occupy.
    clusterOrigin.set(node.id, {
      x: start + (width - own.width) / 2,
      y: topByDepth.get(depthOf.get(node.id) ?? 0)!,
    })
    let cursor = start
    for (const child of children.get(node.id) ?? []) {
      place(child, cursor)
      cursor += subtreeWidth.get(child.id)! + TREE_SIBLING_GAP
    }
  }
  let rootCursor = 0
  for (const root of roots) {
    place(root, rootCursor)
    rootCursor += subtreeWidth.get(root.id)! + TREE_SIBLING_GAP
  }

  // Anchor the whole forest on the shaping origin via its first root.
  const anchor = clusterOrigin.get(roots[0]!.id)!
  const anchorCluster = clusters.get(roots[0]!.id)!
  const shiftX = originX - (anchor.x + anchorCluster.width / 2)
  const shiftY = originY - anchor.y

  return nodes.map((node) => {
    const origin = clusterOrigin.get(node.id)
    const cluster = clusters.get(node.id)!
    if (!origin) return { nodeId: node.id, widgetPositions: [] }
    return {
      nodeId: node.id,
      widgetPositions: cluster.offsets.map((offset) => ({
        x: snapToGrid(origin.x + shiftX + offset.x),
        y: snapToGrid(origin.y + shiftY + offset.y),
      })),
    }
  })
}
