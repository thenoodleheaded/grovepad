import { describe, expect, it } from 'vitest'
import {
  clusterLayout,
  layoutCommittedTree,
  TREE_GENERATION_GAP,
  TREE_SIBLING_GAP,
  type TreeCommitNode,
} from './treeCommitLayout'

const CARD = { width: 320, height: 240 }
const TALL = { width: 320, height: 400 }

function node(id: string, parentId: string | null, order: number, count: number, size = CARD): TreeCommitNode {
  return { id, parentId, order, widgetSizes: Array.from({ length: count }, () => ({ ...size })) }
}

function boundsOf(positions: { x: number; y: number }[], sizes = [CARD]) {
  const size = sizes[0]!
  return {
    minX: Math.min(...positions.map((p) => p.x)),
    minY: Math.min(...positions.map((p) => p.y)),
    maxX: Math.max(...positions.map((p) => p.x + size.width)),
    maxY: Math.max(...positions.map((p) => p.y + size.height)),
  }
}

describe('clusterLayout', () => {
  it('is empty for a node with no widgets', () => {
    expect(clusterLayout([])).toEqual({ width: 0, height: 0, offsets: [] })
  })

  it('top-aligns every member of a row so the plate rim stays flush', () => {
    // A short card beside a tall one must NOT be centred: centring notched the
    // shared plate and staggered the floating title capsules.
    const layout = clusterLayout([CARD, TALL])
    expect(layout.offsets.map((offset) => offset.y)).toEqual([0, 0])
  })

  it('lays a single widget out at the origin with its own size', () => {
    const layout = clusterLayout([CARD])
    expect(layout).toEqual({ width: 320, height: 240, offsets: [{ x: 0, y: 0 }] })
  })

  it('wraps into rows and never overlaps members', () => {
    const layout = clusterLayout(Array.from({ length: 4 }, () => CARD))
    expect(layout.offsets).toHaveLength(4)
    for (let i = 0; i < layout.offsets.length; i += 1) {
      for (let j = i + 1; j < layout.offsets.length; j += 1) {
        const a = layout.offsets[i]!
        const b = layout.offsets[j]!
        const overlaps =
          a.x < b.x + CARD.width && a.x + CARD.width > b.x &&
          a.y < b.y + CARD.height && a.y + CARD.height > b.y
        expect(overlaps, `members ${i} and ${j} overlap`).toBe(false)
      }
    }
  })
})

describe('layoutCommittedTree', () => {
  it('returns nothing for an empty forest', () => {
    expect(layoutCommittedTree([], 0, 0)).toEqual([])
  })

  it('separates sibling bundles by at least the sibling gap', () => {
    const placements = layoutCommittedTree(
      [node('root', null, 0, 1), node('a', 'root', 0, 1), node('b', 'root', 1, 1)],
      0,
      0,
    )
    const a = boundsOf(placements.find((p) => p.nodeId === 'a')!.widgetPositions)
    const b = boundsOf(placements.find((p) => p.nodeId === 'b')!.widgetPositions)
    // Separation is whichever side is actually outside the other.
    const gap = Math.max(b.minX - a.maxX, a.minX - b.maxX)
    expect(gap).toBeGreaterThanOrEqual(TREE_SIBLING_GAP - GRID_TOLERANCE)
  })

  it('puts every generation on its own baseline below the previous one', () => {
    const placements = layoutCommittedTree(
      [node('root', null, 0, 1), node('child', 'root', 0, 1)],
      0,
      0,
    )
    const root = boundsOf(placements.find((p) => p.nodeId === 'root')!.widgetPositions)
    const child = boundsOf(placements.find((p) => p.nodeId === 'child')!.widgetPositions)
    expect(child.minY - root.maxY).toBeGreaterThanOrEqual(TREE_GENERATION_GAP - CARD.height)
    expect(child.minY).toBeGreaterThan(root.minY)
  })

  it('never overlaps any two widgets across the whole forest', () => {
    // The core regression: committed trees used to overlap, which handed the
    // board to overlap-settling and produced a scattered forest.
    const nodes = [
      node('root', null, 0, 2),
      node('a', 'root', 0, 3),
      node('b', 'root', 1, 1),
      node('a1', 'a', 0, 2),
      node('a2', 'a', 1, 1),
    ]
    const placements = layoutCommittedTree(nodes, 500, 500)
    const boxes = placements.flatMap((placement) =>
      placement.widgetPositions.map((position) => ({ ...position, ...CARD })),
    )
    expect(boxes.length).toBe(9)
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!
        const b = boxes[j]!
        const overlaps =
          a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y
        expect(overlaps, `widgets ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  it('anchors the forest on the shaping origin (within grid snapping)', () => {
    const placements = layoutCommittedTree([node('root', null, 0, 1)], 400, 300)
    const root = boundsOf(placements[0]!.widgetPositions)
    expect(Math.abs((root.minX + root.maxX) / 2 - 400)).toBeLessThanOrEqual(GRID_TOLERANCE)
    expect(Math.abs(root.minY - 300)).toBeLessThanOrEqual(GRID_TOLERANCE)
  })

  it('snaps every widget onto the layout grid', () => {
    const placements = layoutCommittedTree(
      [node('root', null, 0, 2), node('child', 'root', 0, 3)],
      137,
      91,
    )
    for (const placement of placements) {
      for (const position of placement.widgetPositions) {
        expect(Math.abs(position.x % GRID_TOLERANCE)).toBe(0)
        expect(Math.abs(position.y % GRID_TOLERANCE)).toBe(0)
      }
    }
  })

  it('centres a parent over the span of its children', () => {
    const placements = layoutCommittedTree(
      [node('root', null, 0, 1), node('a', 'root', 0, 1), node('b', 'root', 1, 1)],
      0,
      0,
    )
    const root = boundsOf(placements.find((p) => p.nodeId === 'root')!.widgetPositions)
    const a = boundsOf(placements.find((p) => p.nodeId === 'a')!.widgetPositions)
    const b = boundsOf(placements.find((p) => p.nodeId === 'b')!.widgetPositions)
    const rootCentre = (root.minX + root.maxX) / 2
    const childSpanCentre = (Math.min(a.minX, b.minX) + Math.max(a.maxX, b.maxX)) / 2
    expect(Math.abs(rootCentre - childSpanCentre)).toBeLessThanOrEqual(GRID_TOLERANCE)
  })
})

/** Positions snap to the grid, so centring can land half a cell either way. */
const GRID_TOLERANCE = 40
