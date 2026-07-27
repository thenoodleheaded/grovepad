import type { Relation, Widget, WidgetGlue } from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'

const UNTANGLE_GAP = GRID_SIZE * 2

/** The exact clearance a compacted tree leaves, in whole grid cells. */
const TREE_GAP_CELLS = 2

interface ClusterRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Split a required separation into two grid-cell-exact shares that sum to
 * exactly `totalPixels`. Both `rects` and `UNTANGLE_GAP` are always integer
 * multiples of `GRID_SIZE`, so `totalPixels` is too — but naively halving it
 * in continuous space (`totalPixels / 2`) is only itself grid-exact when the
 * cell count is even. Splitting in whole cells first (favoring the far side
 * by one extra cell when the count is odd) keeps every individual push
 * grid-aligned, so the sum can never drift from the exact target the way an
 * independent per-side rounding pass would.
 */
function splitGridCells(totalPixels: number): [number, number] {
  const cells = Math.round(totalPixels / GRID_SIZE)
  const near = Math.floor(cells / 2) * GRID_SIZE
  return [near, totalPixels - near]
}

/**
 * Every widget on this canvas, grouped into the rigid blocks these passes are
 * allowed to move: one block per glue cluster, one per extra rigid group (a
 * tree that has just been compacted, held together so the separation pass
 * cannot tear it back apart), and one for every widget in neither.
 *
 * Groups that share a widget merge into a single block — a compacted tree's
 * nodes ARE glue clusters sometimes — so nothing can be pulled two ways at
 * once. Merging is by union-find rather than a first-group-wins scan, because a
 * tree can bridge two glue clusters that never touch each other directly.
 */
function rigidBlocks(
  widgets: Record<string, Widget>,
  canvasId: string,
  groups: readonly (readonly string[])[],
): string[][] {
  const ids = Object.keys(widgets).filter((id) => widgets[id]!.canvasId === canvasId)
  const parent = new Map<string, string>(ids.map((id) => [id, id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    let walk = id
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!
      parent.set(walk, root)
      walk = next
    }
    return root
  }
  for (const group of groups) {
    const members = group.filter((id) => parent.has(id))
    for (let i = 1; i < members.length; i += 1) {
      const a = find(members[0]!)
      const b = find(members[i]!)
      if (a !== b) parent.set(a, b)
    }
  }
  // Grouped in `Object.keys` order so the same board always yields the same
  // blocks in the same order — the relaxation below is order-sensitive.
  const byRoot = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    const block = byRoot.get(root)
    if (block) block.push(id)
    else byRoot.set(root, [id])
  }
  return [...byRoot.values()]
}

/** The bounding box of a rigid block's members. */
function blockRect(members: readonly string[], widgets: Record<string, Widget>): ClusterRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of members) {
    const w = widgets[id]!
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Spread every node on a canvas apart until nothing overlaps, leaving
 * EXACTLY UNTANGLE_GAP (2×2 cells) of clearance between separate nodes —
 * without disturbing arrangements that are already clean.
 *
 * A glue cluster untangles AS A UNIT: its members form one rigid cluster
 * (bounding box of the members) that translates together, so their welded
 * layout is preserved and only whole clusters are pushed off each other.
 * Every unglued widget is its own single-member cluster, and `rigidGroups`
 * adds blocks that must hold their shape for the same reason a weld does —
 * a tree `compactSelectedTrees` has just laid out. Clusters are separated by
 * iterative symmetric relaxation; every push is computed in whole grid cells
 * (`splitGridCells`) so the resulting gap between any two clusters that were
 * touching is exactly UNTANGLE_GAP, never a pixel more or less.
 */
/** Exported for direct unit testing of the exact-gap guarantee — not part of the store's public action surface. */
export function untangleCanvasLayout(
  widgets: Record<string, Widget>,
  glues: Record<string, WidgetGlue>,
  canvasId: string,
  rigidGroups: readonly (readonly string[])[] = [],
): Record<string, Widget> {
  const clusterMembers = rigidBlocks(widgets, canvasId, [
    ...Object.values(glues).map((glue) => glue.widgetIds),
    ...rigidGroups,
  ])

  const n = clusterMembers.length
  if (n < 2) return widgets

  const rects: ClusterRect[] = clusterMembers.map((members) => blockRect(members, widgets))
  const originX = rects.map((r) => r.x)
  const originY = rects.map((r) => r.y)

  const gap = UNTANGLE_GAP
  const overlaps = (a: ClusterRect, b: ClusterRect) =>
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y

  // Iterative symmetric relaxation: each pass shoves every overlapping pair
  // apart along its shallower axis, splitting the push in whole grid cells so
  // both clusters move roughly equally (keeps the board centered instead of
  // drifting one way) while the combined push remains exactly the required
  // separation — never approximated by rounding. Resolving one pair can nudge
  // another into overlap, so passes repeat until a full sweep finds nothing
  // left touching — or the cap trips on a pathological board.
  const maxPasses = 80
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const a = rects[i]!
      for (let j = i + 1; j < n; j++) {
        const b = rects[j]!
        if (!overlaps(a, b)) continue
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap
        if (overlapX <= overlapY) {
          // b to the right of a → b moves +, a moves − (deterministic on tie).
          const dir = b.x + b.width / 2 >= a.x + a.width / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapX)
          a.x -= dir * pushA
          b.x += dir * pushB
        } else {
          const dir = b.y + b.height / 2 >= a.y + a.height / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapY)
          a.y -= dir * pushA
          b.y += dir * pushB
        }
        moved = true
      }
    }
    if (!moved) break
  }

  let changed = false
  const next: Record<string, Widget> = { ...widgets }
  for (let ci = 0; ci < n; ci++) {
    // Every push above was already an exact multiple of GRID_SIZE, so this
    // total is too — snapToGrid here is a defensive no-op, not a rounding step.
    const dx = snapToGrid(rects[ci]!.x - originX[ci]!)
    const dy = snapToGrid(rects[ci]!.y - originY[ci]!)
    if (dx === 0 && dy === 0) continue
    for (const id of clusterMembers[ci]!) {
      const w = widgets[id]!
      next[id] = { ...w, position: { x: w.position.x + dx, y: w.position.y + dy } }
      changed = true
    }
  }
  return changed ? next : widgets
}

export interface CompactedTrees {
  /** The same widget map, with every compacted tree's members moved into place. */
  widgets: Record<string, Widget>
  /**
   * The member ids of each tree that was compacted, one array per tree. These
   * are handed straight to `untangleCanvasLayout` as rigid groups: a tree that
   * has just been laid out exactly must survive the separation pass whole.
   */
  trees: string[][]
}

/** Rounds a span up to whole grid cells, so the lattice below stays exact. */
function cellsFor(span: number): number {
  return Math.max(1, Math.ceil(span / GRID_SIZE))
}

interface TreeNode {
  /** Index of this node's rigid block. */
  block: number
  children: number[]
  depth: number
  /** Own footprint and reserved subtree width, in whole grid cells. */
  ownCells: { width: number; height: number }
  subtreeCells: number
}

/**
 * Pull every parent-linked family inside `widgets` together into an exact
 * lattice: TREE_GAP_CELLS (2 cells) between neighbouring nodes across a
 * generation, and TREE_GAP_CELLS between one generation and the next. This is
 * the compacting half of the Untangle button — the separation pass above only
 * ever pushes things apart, so a tree that had drifted into a sprawl stayed a
 * sprawl no matter how many times it was untangled.
 *
 * What counts as one node is exactly what counts as one node everywhere else on
 * the board: a glue cluster is a single node that keeps its welded layout, and
 * every other widget is its own node. Only 'parent' relations shape the tree
 * (dependencies and cousins say nothing about arrangement), and only when BOTH
 * ends are in `widgets` — the caller passes the selection, so a tree is
 * compacted on the strength of the part of it you selected.
 *
 * Each generation is a row sharing one top baseline, and every parent is
 * centred over the span its own descendants occupy — so the 2-cell vertical gap
 * is measured between generation rows, and a node shorter than the tallest in
 * its row sits further than 2 cells from its children. Widths are reserved per
 * subtree, so branches keep clear of each other rather than interleaving, and
 * every reservation, gap, and centring offset is a whole number of cells: the
 * gap between two neighbouring nodes of equal width is exactly 2 cells, and it
 * can never come out under 2. The tree stays where it was — its root holds its
 * position and the branches tighten underneath it.
 *
 * Sizes are the widgets' own boxes, the same rects `untangleCanvasLayout`
 * separates; a card's floating title row is not reserved space here either.
 */
export function compactSelectedTrees(
  widgets: Record<string, Widget>,
  glues: Record<string, WidgetGlue>,
  relations: Record<string, Relation>,
  canvasId: string,
): CompactedTrees {
  const blocks = rigidBlocks(widgets, canvasId, Object.values(glues).map((glue) => glue.widgetIds))
  if (blocks.length < 2) return { widgets, trees: [] }

  const rects = blocks.map((members) => blockRect(members, widgets))
  const blockOf = new Map<string, number>()
  blocks.forEach((members, index) => {
    for (const id of members) blockOf.set(id, index)
  })

  // Parent edges BETWEEN blocks. A relation whose two ends live in the same
  // block says nothing about layout — that pair already moves as one thing.
  const children = new Map<number, number[]>()
  const parents = new Map<number, number[]>()
  const seenEdges = new Set<string>()
  for (const relation of Object.values(relations)) {
    if (relation.type !== 'parent') continue
    const from = blockOf.get(relation.fromId)
    const to = blockOf.get(relation.toId)
    if (from === undefined || to === undefined || from === to) continue
    const key = `${from}>${to}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    children.set(from, [...(children.get(from) ?? []), to])
    parents.set(to, [...(parents.get(to) ?? []), from])
  }
  if (seenEdges.size === 0) return { widgets, trees: [] }

  // Families: connected components over those edges, ignoring direction.
  const family = new Map<number, number>()
  const families: number[][] = []
  for (const start of [...children.keys(), ...parents.keys()]) {
    if (family.has(start)) continue
    const members: number[] = []
    const queue = [start]
    family.set(start, families.length)
    while (queue.length > 0) {
      const block = queue.shift()!
      members.push(block)
      for (const next of [...(children.get(block) ?? []), ...(parents.get(block) ?? [])]) {
        if (family.has(next)) continue
        family.set(next, families.length)
        queue.push(next)
      }
    }
    families.push(members)
  }

  // Reading order is the user's own arrangement: siblings keep the left-to-right
  // order they are already in, so compacting tidies a tree without reshuffling
  // it into something unrecognisable.
  const readingOrder = (a: number, b: number) => {
    const ra = rects[a]!
    const rb = rects[b]!
    return ra.x - rb.x || ra.y - rb.y || (blocks[a]![0]! < blocks[b]![0]! ? -1 : 1)
  }

  const positions: Record<string, { x: number; y: number }> = {}
  const trees: string[][] = []

  for (const members of families) {
    if (members.length < 2) continue

    // Roots are the blocks nothing in this family parents. A free-form board
    // may hold parent cycles, so a family with no root falls back to its
    // topmost block and the visited guard below breaks the loop.
    const inFamily = new Set(members)
    const roots = members
      .filter((block) => (parents.get(block) ?? []).filter((p) => inFamily.has(p)).length === 0)
      .sort(readingOrder)
    if (roots.length === 0) {
      roots.push([...members].sort((a, b) => rects[a]!.y - rects[b]!.y || readingOrder(a, b))[0]!)
    }

    // One walk fixes the tree's shape: a block is claimed the moment a parent
    // takes it, so a co-parented node (or one inside a parent cycle) is placed
    // exactly once — under the first parent that reached it — and every node's
    // reserved width matches what actually ends up beneath it.
    const nodes = new Map<number, TreeNode>()
    const claimed = new Set<number>(roots)
    const walk = (block: number, depth: number) => {
      const rect = rects[block]!
      const kids = (children.get(block) ?? [])
        .filter((kid) => inFamily.has(kid) && !claimed.has(kid))
        .sort(readingOrder)
      for (const kid of kids) claimed.add(kid)
      nodes.set(block, {
        block,
        children: kids,
        depth,
        ownCells: { width: cellsFor(rect.width), height: cellsFor(rect.height) },
        subtreeCells: 0,
      })
      for (const kid of kids) walk(kid, depth + 1)
    }
    for (const root of roots) walk(root, 0)

    // Width reservation, bottom-up: a subtree is as wide as its own node or the
    // row of its children's subtrees, whichever needs more.
    const reserve = (block: number): number => {
      const node = nodes.get(block)!
      const spread = node.children.length === 0
        ? 0
        : node.children.reduce((total, kid) => total + reserve(kid), 0)
          + TREE_GAP_CELLS * (node.children.length - 1)
      node.subtreeCells = Math.max(node.ownCells.width, spread)
      return node.subtreeCells
    }
    for (const root of roots) reserve(root)

    // One shared top baseline per generation, sized by the tallest node in it.
    const rowHeight = new Map<number, number>()
    for (const node of nodes.values()) {
      rowHeight.set(node.depth, Math.max(rowHeight.get(node.depth) ?? 0, node.ownCells.height))
    }
    const rowTop = new Map<number, number>()
    let cursorY = 0
    for (let depth = 0; rowHeight.has(depth); depth += 1) {
      rowTop.set(depth, cursorY)
      cursorY += rowHeight.get(depth)! + TREE_GAP_CELLS
    }

    const placed = new Map<number, { x: number; y: number }>()
    const place = (block: number, startCell: number) => {
      const node = nodes.get(block)!
      // Centre the node over its own span, in whole cells — a half-cell centring
      // offset is what would turn an exact 2-cell gap into 2½.
      placed.set(block, {
        x: startCell + Math.floor((node.subtreeCells - node.ownCells.width) / 2),
        y: rowTop.get(node.depth)!,
      })
      let cursor = startCell
      for (const kid of node.children) {
        place(kid, cursor)
        cursor += nodes.get(kid)!.subtreeCells + TREE_GAP_CELLS
      }
    }
    let rootCursor = 0
    for (const root of roots) {
      place(root, rootCursor)
      rootCursor += nodes.get(root)!.subtreeCells + TREE_GAP_CELLS
    }

    // Anchor the lattice on the first root's own corner, snapped to the grid:
    // the tree tightens around where it already is instead of jumping.
    const anchorRoot = placed.get(roots[0]!)!
    const anchorRect = rects[roots[0]!]!
    const anchorX = snapToGrid(anchorRect.x) - anchorRoot.x * GRID_SIZE
    const anchorY = snapToGrid(anchorRect.y) - anchorRoot.y * GRID_SIZE

    const treeMembers: string[] = []
    for (const [block, cell] of placed) {
      const rect = rects[block]!
      const dx = anchorX + cell.x * GRID_SIZE - rect.x
      const dy = anchorY + cell.y * GRID_SIZE - rect.y
      for (const id of blocks[block]!) {
        treeMembers.push(id)
        if (dx === 0 && dy === 0) continue
        const widget = widgets[id]!
        positions[id] = { x: widget.position.x + dx, y: widget.position.y + dy }
      }
    }
    trees.push(treeMembers)
  }

  if (trees.length === 0) return { widgets, trees: [] }
  const moved = Object.keys(positions)
  if (moved.length === 0) return { widgets, trees }
  const next: Record<string, Widget> = { ...widgets }
  for (const id of moved) next[id] = { ...widgets[id]!, position: positions[id]! }
  return { widgets: next, trees }
}
