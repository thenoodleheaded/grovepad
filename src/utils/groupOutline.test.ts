import { describe, expect, it } from 'vitest'
import {
  groupPlateGeometry,
  roundedRectilinearPath,
  unionOutlines,
  unionRoundedPath,
} from './groupOutline'

describe('unionOutlines', () => {
  it('traces a single rect as one clockwise contour', () => {
    const outlines = unionOutlines([{ x: 0, y: 0, width: 100, height: 60 }])
    expect(outlines).toEqual([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ],
    ])
  })

  it('merges overlapping rects into one L-shaped contour', () => {
    const outlines = unionOutlines([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 60, y: 60, width: 100, height: 100 },
    ])
    expect(outlines).toHaveLength(1)
    expect(outlines[0]).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 160, y: 60 },
      { x: 160, y: 160 },
      { x: 60, y: 160 },
      { x: 60, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  it('fuses edge-adjacent rects without an interior seam', () => {
    const outlines = unionOutlines([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 100, y: 0, width: 100, height: 100 },
    ])
    expect(outlines).toEqual([
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ],
    ])
  })

  it('keeps disjoint rects as separate contours', () => {
    const outlines = unionOutlines([
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 200, y: 0, width: 50, height: 50 },
    ])
    expect(outlines).toHaveLength(2)
  })

  it('keeps corner-touching rects as two simple contours', () => {
    const outlines = unionOutlines([
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ])
    expect(outlines).toHaveLength(2)
    for (const contour of outlines) expect(contour).toHaveLength(4)
  })

  it('fills interior holes instead of cutting a donut', () => {
    // Four rects forming a ring around an empty 40×40 centre.
    const outlines = unionOutlines([
      { x: 0, y: 0, width: 120, height: 40 },
      { x: 0, y: 80, width: 120, height: 40 },
      { x: 0, y: 40, width: 40, height: 40 },
      { x: 80, y: 40, width: 40, height: 40 },
    ])
    expect(outlines).toEqual([
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
    ])
  })
})

describe('roundedRectilinearPath', () => {
  it('rounds a rect with arcs at every corner', () => {
    const path = roundedRectilinearPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ],
      10,
    )
    expect(path).toBe(
      'M 0 10 A 10 10 0 0 1 10 0 L 90 0 A 10 10 0 0 1 100 10 L 100 50 A 10 10 0 0 1 90 60 L 10 60 A 10 10 0 0 1 0 50 Z',
    )
  })

  it('clamps the radius to half of short edges', () => {
    const path = roundedRectilinearPath(
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 60 },
        { x: 0, y: 60 },
      ],
      40,
    )
    // 12-wide strip: corner arcs shrink to r = 6 so opposite arcs meet cleanly.
    expect(path).toContain('A 6 6 0 0 1')
    expect(path).not.toContain('A 40')
  })

  it('uses opposite sweep on concave corners', () => {
    const path = roundedRectilinearPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 160, y: 60 },
        { x: 160, y: 160 },
        { x: 60, y: 160 },
        { x: 60, y: 100 },
        { x: 0, y: 100 },
      ],
      10,
    )
    // The two reflex corners of the L arc the other way (sweep 0).
    expect(path.match(/A 10 10 0 0 0 /g)).toHaveLength(2)
    expect(path.match(/A 10 10 0 0 1 /g)).toHaveLength(6)
  })
})

describe('groupPlateGeometry', () => {
  // Wide enough (with an empty title) that the default 3 buttons + detach +
  // plus still fit the title row — no button overflow, so the footprint's
  // width stays exactly the card width plus half a cell of top-only pad.
  const member = (x: number, y: number, width = 400) => ({
    position: { x, y },
    size: { width, height: 160 },
    type: 'notes' as const,
    title: '',
    metadata: { badges: [] },
  })

  it('wraps hover footprints (half a cell up, no extra width without button overflow) plus the group pad', () => {
    const geometry = groupPlateGeometry([member(0, 0)])
    // Hover footprint: x 0, y −20, w 400, h 180; +38 pad on every side.
    expect(geometry?.bounds).toEqual({ x: -38, y: -58, width: 476, height: 256 })
    expect(geometry?.glassPath).toContain('M ')
    expect(geometry?.hitPath).toContain('M ')
  })

  it('adds half a cell of width only when the member has overflowing buttons', () => {
    const tight = groupPlateGeometry([{ ...member(0, 0, 240) }])
    // width 240 + empty title, grouped (detach button): 5 items need 5 slots
    // but only 4 fit -> overflow -> +20px of width on top of the +38 pad.
    expect(tight?.bounds.width).toBe(240 + 20 + 38 * 2)
  })

  it('emits a concave silhouette for overlapping offset members, not their bounding box', () => {
    // Diagonal step: padded footprints overlap, so the union is one staircase
    // outline with concave corners → at least one sweep-0 arc. A bounding
    // rectangle would have none.
    const geometry = groupPlateGeometry([member(0, 0), member(200, 120)])
    expect(geometry?.glassPath).toContain(' 0 0 0 ')
    expect(geometry?.glassPath.match(/M /g)).toHaveLength(1)
  })

  it('keeps far-apart members as separate glass islands under one plate', () => {
    const geometry = groupPlateGeometry([member(0, 0), member(400, 400)])
    expect(geometry?.glassPath.match(/M /g)).toHaveLength(2)
  })

  it('returns null for an empty member list', () => {
    expect(groupPlateGeometry([])).toBeNull()
  })

  it('joins disjoint members as multiple subpaths under one path string', () => {
    const path = unionRoundedPath(
      [
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 500, y: 0, width: 50, height: 50 },
      ],
      8,
    )
    expect(path.match(/M /g)).toHaveLength(2)
    expect(path.match(/Z/g)).toHaveLength(2)
  })
})
