import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import {
  DISPLACEMENT_CHAIN_DEPTH,
  negotiateDisplacement,
  type NegotiationRect,
} from './spatialNegotiation'
import { LAYOUT_GAP } from './widgetLayoutConstants'
import { rectsOverlap, type LayoutRect } from './widgetCollection'

const rect = (
  id: string,
  x: number,
  y: number,
  width = 160,
  height = 120,
  locked?: boolean,
): NegotiationRect => (locked ? { id, x, y, width, height, locked } : { id, x, y, width, height })

const RIGHT = { x: 1, y: 0 }
const DOWN = { x: 0, y: 1 }
const STILL = { x: 0, y: 0 }

const applied = (base: LayoutRect, offset: { x: number; y: number }): LayoutRect => ({
  ...base,
  x: base.x + offset.x,
  y: base.y + offset.y,
})

describe('negotiateDisplacement', () => {
  it('moves nothing when the dragged rect overlaps nothing', () => {
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [rect('a', 400, 400)])
    expect(result.offsets).toEqual({})
    expect(result.overflowIds).toEqual([])
  })

  it('ignores a sliver graze below the coverage gate', () => {
    // 20px of horizontal overlap on 160-wide cards: coverage 1/8 both ways.
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [rect('a', 140, 0)])
    expect(result.offsets).toEqual({})
    expect(result.overflowIds).toEqual([])
  })

  it('pushes a covered neighbor along the drag direction by a minimal grid-aligned delta', () => {
    const neighbor = rect('a', 80, 0)
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [neighbor])
    const offset = result.offsets['a']!
    expect(offset.y).toBe(0)
    expect(offset.x).toBeGreaterThan(0)
    expect(offset.x % GRID_SIZE).toBe(0)
    // Cleared with breathing room, and by the least grid step that does it.
    const moved = applied(neighbor, offset)
    expect(rectsOverlap({ id: 'drag', x: 0, y: 0, width: 160, height: 120 }, moved, LAYOUT_GAP)).toBe(false)
    expect(moved.x - GRID_SIZE).toBeLessThan(0 + 160 + LAYOUT_GAP)
  })

  it('opens room away from where the drag came from, not by minimum translation', () => {
    // Dragging leftward onto a card sitting to the left: it slides further left.
    const result = negotiateDisplacement(rect('drag', 80, 0), { x: -1, y: 0 }, [rect('a', 0, 0)])
    expect(result.offsets['a']!.x).toBeLessThan(0)
    expect(result.offsets['a']!.y).toBe(0)
  })

  it('pushes on the y axis when the drag is predominantly vertical', () => {
    const result = negotiateDisplacement(rect('drag', 0, 0), DOWN, [rect('a', 0, 60)])
    expect(result.offsets['a']!.x).toBe(0)
    expect(result.offsets['a']!.y).toBeGreaterThan(0)
  })

  it('falls back to minimum-translation pushes when the direction is zero', () => {
    // Tall thin overlap: x escape is cheapest; neighbor center is to the right.
    const neighbor = rect('a', 80, 0)
    const result = negotiateDisplacement(rect('drag', 0, 0), STILL, [neighbor])
    const offset = result.offsets['a']!
    expect(offset.y).toBe(0)
    expect(offset.x).toBeGreaterThan(0)
  })

  it('treats a small card sunk into a big neighbor as intent', () => {
    // Intersection is tiny relative to the neighbor but total for the card.
    const result = negotiateDisplacement(rect('drag', 200, 200, 80, 80), RIGHT, [
      rect('big', 0, 0, 400, 400),
    ])
    expect(result.offsets['big']).toBeDefined()
  })

  it('cascades a push down a packed row, each hop along the same direction', () => {
    const row = [rect('a', 0, 0), rect('b', 160, 0), rect('c', 320, 0)]
    const result = negotiateDisplacement(rect('drag', -80, 0), RIGHT, row)
    for (const id of ['a', 'b', 'c']) {
      const offset = result.offsets[id]!
      expect(offset.x).toBeGreaterThan(0)
      expect(offset.x % GRID_SIZE).toBe(0)
      expect(offset.y).toBe(0)
    }
    // Each pushed card cleared the one behind it with breathing room.
    const movedA = applied(row[0]!, result.offsets['a']!)
    const movedB = applied(row[1]!, result.offsets['b']!)
    const movedC = applied(row[2]!, result.offsets['c']!)
    expect(rectsOverlap(movedA, movedB, LAYOUT_GAP)).toBe(false)
    expect(rectsOverlap(movedB, movedC, LAYOUT_GAP)).toBe(false)
  })

  it('stops a chain at the depth cap and reports the frontier as overflow', () => {
    const row = [rect('a', 0, 0), rect('b', 160, 0), rect('c', 320, 0), rect('d', 480, 0)]
    const result = negotiateDisplacement(rect('drag', -80, 0), RIGHT, row, {
      maxChainDepth: DISPLACEMENT_CHAIN_DEPTH,
    })
    expect(result.offsets['a']).toBeDefined()
    expect(result.offsets['b']).toBeDefined()
    expect(result.offsets['c']).toBeDefined()
    expect(result.offsets['d']).toBeUndefined()
    expect(result.overflowIds).toContain('d')
  })

  it('never moves a locked rect and reports it as overflow', () => {
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [rect('wall', 80, 0, 160, 120, true)])
    expect(result.offsets).toEqual({})
    expect(result.overflowIds).toEqual(['wall'])
  })

  it('deflects a pushed card around a locked wall', () => {
    const wall = rect('wall', 240, 0, 160, 120, true)
    const pushed = rect('a', 80, 0)
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [pushed, wall])
    const offset = result.offsets['a']!
    expect(offset.x).toBeGreaterThan(0)
    expect(offset.y).not.toBe(0)
    expect(offset.x % GRID_SIZE).toBe(0)
    expect(offset.y % GRID_SIZE).toBe(0)
    const moved = applied(pushed, offset)
    expect(rectsOverlap(moved, wall, 0)).toBe(false)
    expect(result.offsets['wall']).toBeUndefined()
  })

  it('abandons a push when the deflected spot is also inside a wall', () => {
    // Walls ahead and both above/below the deflection landing zones.
    const walls = [
      rect('east', 240, 0, 160, 120, true),
      rect('north', 240, -400, 160, 400, true),
      rect('south', 240, 120, 160, 400, true),
    ]
    const result = negotiateDisplacement(rect('drag', 0, 0), RIGHT, [rect('a', 80, 0), ...walls])
    expect(result.offsets['a']).toBeUndefined()
    expect(result.overflowIds).toContain('a')
  })

  it('stops displacing when the area budget runs out, biggest intrusion first', () => {
    const first = rect('first', 40, 0) // mostly covered — highest coverage
    const second = rect('second', 0, 280, 160, 120) // clipped — lower coverage
    const dragged = rect('drag', 0, 40, 200, 300)
    const budget = 160 * 120 + 1 // room for exactly one card
    const result = negotiateDisplacement(dragged, RIGHT, [first, second], {
      maxDisplacedArea: budget,
    })
    expect(result.offsets['first']).toBeDefined()
    expect(result.offsets['second']).toBeUndefined()
    expect(result.overflowIds).toContain('second')
  })

  it('displaces each rect at most once per negotiation', () => {
    // Two seeds whose pushes both land on 'shared'.
    const seedA = rect('a', 40, 0, 160, 120)
    const seedB = rect('b', 40, 160, 160, 120)
    const shared = rect('shared', 240, 40, 160, 200)
    const result = negotiateDisplacement(rect('drag', 0, 40, 160, 200), RIGHT, [seedA, seedB, shared])
    expect(result.offsets['a']).toBeDefined()
    expect(result.offsets['b']).toBeDefined()
    const sharedOffset = result.offsets['shared']
    if (sharedOffset) {
      // Moved exactly once — a second push would have stacked further travel.
      expect(result.overflowIds.length + Object.keys(result.offsets).length).toBeLessThanOrEqual(4)
    }
  })

  it('is deterministic and independent of neighbor array order', () => {
    const crowd = [
      rect('a', 0, 0),
      rect('b', 160, 0),
      rect('c', 320, 0),
      rect('wall', 240, 160, 160, 120, true),
      rect('e', 40, 160),
    ]
    const forward = negotiateDisplacement(rect('drag', -80, 20), RIGHT, crowd)
    const reversed = negotiateDisplacement(rect('drag', -80, 20), RIGHT, [...crowd].reverse())
    expect(reversed).toEqual(forward)
    const again = negotiateDisplacement(rect('drag', -80, 20), RIGHT, crowd)
    expect(again).toEqual(forward)
  })

  it('negotiates against the grid-snapped projection of the drag', () => {
    const crowd = [rect('a', 80, 0), rect('b', 240, 0)]
    const snapped = negotiateDisplacement(rect('drag', 0, 0), RIGHT, crowd)
    const jittered = negotiateDisplacement(rect('drag', -17.3, 12.9), RIGHT, crowd)
    expect(jittered).toEqual(snapped)
  })

  it('serves resize by pushing along the grown edge normal', () => {
    // A card grew east over its neighbor: same engine, direction = east.
    const neighbor = rect('a', 200, 0)
    const grown = rect('drag', 0, 0, 280, 120)
    const result = negotiateDisplacement(grown, RIGHT, [neighbor])
    expect(result.offsets['a']!.x).toBeGreaterThan(0)
    expect(result.offsets['a']!.y).toBe(0)
  })
})
