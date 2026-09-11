import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import { LINE_STANDOFF, routeEdge, routeEdgeToPoint, type EdgeNode } from './edgeRoute'

function node(x: number, y: number, width = 240, height = 120, pill?: EdgeNode['pill']): EdgeNode {
  return {
    center: { x: x + width / 2, y: y + height / 2 },
    halfW: width / 2,
    halfH: height / 2,
    pill,
  }
}

/** Every number in the path, in order: M x y C c1x c1y c2x c2y ex ey. */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

describe('the standoff', () => {
  it('is 0.3 of a grid cell', () => {
    expect(LINE_STANDOFF).toBe(GRID_SIZE * 0.3)
    expect(LINE_STANDOFF).toBe(12)
  })

  it('holds both ends exactly that far off the cards they touch', () => {
    const parent = node(0, 0)
    const child = node(0, 400)
    const route = routeEdge(parent, child)
    // The parent's bottom border is y = 120; the child's top is y = 400.
    expect(route.start.y).toBe(120 + LINE_STANDOFF)
    expect(route.end.y).toBe(400 - LINE_STANDOFF)
  })

  it('keeps the same gap sideways', () => {
    const left = node(0, 0)
    const right = node(500, 0)
    const route = routeEdge(left, right)
    expect(route.startSide).toBe('right')
    expect(route.endSide).toBe('left')
    expect(route.start.x).toBe(240 + LINE_STANDOFF)
    expect(route.end.x).toBe(500 - LINE_STANDOFF)
  })
})

describe('the shape of a line', () => {
  it('is one cubic and nothing more — no escape hops, no middle section', () => {
    const d = routeEdge(node(0, 0), node(320, 420)).d
    expect(d.match(/C/g)).toHaveLength(1)
    expect(numbers(d)).toHaveLength(8)
    expect(d).not.toMatch(/NaN|Infinity/)
  })

  it('runs dead straight when one card sits under the other', () => {
    const route = routeEdge(node(0, 0), node(40, 400))
    expect(route.start.x).toBe(route.end.x)
    const [, , c1x, , c2x] = numbers(route.d)
    // Colinear controls: the cubic renders as a straight vertical line.
    expect(c1x).toBe(route.start.x)
    expect(c2x).toBe(route.start.x)
  })

  it('runs dead straight when the cards sit side by side', () => {
    const route = routeEdge(node(0, 0), node(500, 30))
    expect(route.start.y).toBe(route.end.y)
    const [, , , c1y, , c2y] = numbers(route.d)
    expect(c1y).toBe(route.start.y)
    expect(c2y).toBe(route.start.y)
  })

  it('meets in the middle when the two ends face each other squarely', () => {
    // Tangents are half the forward run each, so an offset pair reads as one
    // symmetric S rather than a bulge.
    const route = routeEdge(node(0, 0), node(280, 400))
    const [sy, , , c1y, , c2y] = [route.start.y, ...numbers(route.d).slice(1)]
    expect(c1y).toBe(sy + (route.end.y - route.start.y) / 2)
    expect(c2y).toBe(route.end.y - (route.end.y - route.start.y) / 2)
  })

  it('keeps a steep strict climb turning close to its card', () => {
    // Parent's lower half out to the right, child far above. The tangent stays
    // half the forward run: padding it with the vertical run made the line run
    // flat past its own card before hooking away.
    const route = routeEdge(node(0, 0), node(360, -480), { from: 'lower', to: 'upper' })
    const [sx, , c1x] = numbers(route.d) as number[]
    expect(c1x! - sx!).toBeCloseTo((route.end.x - route.start.x) / 2, 6)
  })

  it('never leaves a card heading away from where it is going', () => {
    const cases: Array<[EdgeNode, EdgeNode]> = [
      [node(0, 0), node(0, 400)],
      [node(0, 400), node(0, 0)],
      [node(0, 0), node(600, 40)],
      [node(600, 40), node(0, 0)],
      [node(0, 0), node(520, 480)],
      [node(520, 480), node(0, 0)],
    ]
    for (const [from, to] of cases) {
      const route = routeEdge(from, to)
      const [sx, sy, c1x, c1y, c2x, c2y, ex, ey] = numbers(route.d) as number[]
      const span = { x: ex! - sx!, y: ey! - sy! }
      // Both tangents point along the travel, not back into their own card.
      expect((c1x! - sx!) * span.x + (c1y! - sy!) * span.y).toBeGreaterThan(0)
      expect((ex! - c2x!) * span.x + (ey! - c2y!) * span.y).toBeGreaterThan(0)
    }
  })
})

describe('where a line derives from', () => {
  it('slides along the border instead of pinning to one card centre', () => {
    const parent = node(0, 0, 400, 120)
    const leftChild = routeEdge(parent, node(-40, 400))
    const rightChild = routeEdge(parent, node(320, 400))
    expect(leftChild.start.x).not.toBe(rightChild.start.x)
    expect(leftChild.start.x).toBeLessThan(parent.center.x)
    expect(rightChild.start.x).toBeGreaterThan(parent.center.x)
  })

  it('stays clear of the rounded corners', () => {
    const parent = node(0, 0, 240, 120)
    // A child far off to the left still lands inside the border, never on the
    // corner radius itself.
    const route = routeEdge(parent, node(-900, 600))
    if (route.startSide === 'bottom') {
      expect(route.start.x).toBeGreaterThan(-LINE_STANDOFF)
    }
  })
})

describe('the strict-hold halves', () => {
  const parent = node(0, 0)
  const strict = { from: 'lower', to: 'upper' } as const

  it('leaves the parent low and enters the child high when the child is below', () => {
    const child = node(320, 400)
    const route = routeEdge(parent, child, strict)
    expect(route.start.y).toBeGreaterThanOrEqual(parent.center.y)
    expect(route.end.y).toBeLessThanOrEqual(child.center.y)
    expect(route.startSide).toBe('bottom')
    expect(route.endSide).toBe('top')
  })

  it('holds the halves when the child sits beside the parent', () => {
    const child = node(500, 20)
    const route = routeEdge(parent, child, strict)
    expect(route.start.y).toBeGreaterThanOrEqual(parent.center.y)
    expect(route.end.y).toBeLessThanOrEqual(child.center.y)
  })

  it('holds the halves even when the child has been dragged above the parent', () => {
    const child = node(360, -420)
    const route = routeEdge(parent, child, strict)
    expect(route.startSide).not.toBe('top')
    expect(route.endSide).not.toBe('bottom')
    expect(route.start.y).toBeGreaterThanOrEqual(parent.center.y)
    expect(route.end.y).toBeLessThanOrEqual(child.center.y)
    expect(route.d).not.toMatch(/NaN|Infinity/)
  })

  it('leaves a soft link free to use whichever borders face each other', () => {
    const child = node(500, 20)
    const soft = routeEdge(parent, child)
    expect(soft.startSide).toBe('right')
    expect(soft.endSide).toBe('left')
  })
})

describe('the name capsule', () => {
  it('slides a top landing clear of the capsule instead of stopping under it', () => {
    // The child's capsule floats above its left shoulder, exactly where a
    // straight drop from the parent would otherwise land.
    const child = node(0, 400, 240, 120, { cx: 60, cy: 400 - 20, rx: 60, ry: 16 })
    const route = routeEdge(node(0, 0), child)
    expect(route.endSide).toBe('top')
    expect(route.end.x).toBeGreaterThan(60 + 60)
  })
})

describe('the link-drag preview', () => {
  it('starts on the card border and ends exactly on the cursor', () => {
    const d = routeEdgeToPoint(node(0, 0), { x: 620, y: 340 })
    const [sx, sy, , , , , ex, ey] = numbers(d) as number[]
    expect(ex).toBe(620)
    expect(ey).toBe(340)
    // Never begins inside the card it is dragged from.
    expect(sx! >= 240 + LINE_STANDOFF || sy! >= 120 + LINE_STANDOFF).toBe(true)
    expect(d).not.toMatch(/NaN|Infinity/)
  })
})
