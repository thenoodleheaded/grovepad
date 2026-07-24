import { describe, expect, it } from 'vitest'
import {
  anchoredOrigin,
  outwardGrowth,
  recenteredOrigin,
  resizeEdgeAt,
  resizeEdgeCursor,
  resizeEdgeKey,
  sameResizeEdge,
} from './widgetResizeEdge'

const CARD = { width: 400, height: 300 }

describe('outline proximity', () => {
  it('arms nothing from the interior', () => {
    expect(resizeEdgeAt({ x: 200, y: 150 }, CARD)).toBeNull()
  })

  it('arms one side from the middle of that side', () => {
    expect(resizeEdgeAt({ x: 2, y: 150 }, CARD)).toEqual({ x: -1, y: 0 })
    expect(resizeEdgeAt({ x: 398, y: 150 }, CARD)).toEqual({ x: 1, y: 0 })
    expect(resizeEdgeAt({ x: 200, y: 2 }, CARD)).toEqual({ x: 0, y: -1 })
    expect(resizeEdgeAt({ x: 200, y: 298 }, CARD)).toEqual({ x: 0, y: 1 })
  })

  it('arms both sides near a corner, which is how a diagonal drag is reached', () => {
    expect(resizeEdgeAt({ x: 3, y: 3 }, CARD)).toEqual({ x: -1, y: -1 })
    expect(resizeEdgeAt({ x: 397, y: 297 }, CARD)).toEqual({ x: 1, y: 1 })
    // Still inside the corner box along the perpendicular axis: the side that
    // was only barely armed gets promoted so the diagonal is not pixel-exact.
    expect(resizeEdgeAt({ x: 2, y: 18 }, CARD)).toEqual({ x: -1, y: -1 })
  })

  it('tolerates a pixel of overshoot past the border but not a gap', () => {
    expect(resizeEdgeAt({ x: -4, y: 150 }, CARD)).toEqual({ x: -1, y: 0 })
    expect(resizeEdgeAt({ x: -40, y: 150 }, CARD)).toBeNull()
  })

  it('never turns a small tile into one undifferentiated hit area', () => {
    const tile = { width: 40, height: 40 }
    expect(resizeEdgeAt({ x: 20, y: 20 }, tile)).toBeNull()
  })
})

describe('edge descriptors', () => {
  it('names each armed edge for CSS with disjoint letters', () => {
    expect(resizeEdgeKey({ x: -1, y: -1 })).toBe('tl')
    expect(resizeEdgeKey({ x: 1, y: 1 })).toBe('br')
    expect(resizeEdgeKey({ x: 0, y: -1 })).toBe('t')
    expect(resizeEdgeKey({ x: 1, y: 0 })).toBe('r')
    expect(resizeEdgeKey(null)).toBeUndefined()
  })

  it('picks the cursor that matches the axes in play', () => {
    expect(resizeEdgeCursor({ x: 0, y: 1 })).toBe('ns-resize')
    expect(resizeEdgeCursor({ x: -1, y: 0 })).toBe('ew-resize')
    expect(resizeEdgeCursor({ x: -1, y: -1 })).toBe('nwse-resize')
    expect(resizeEdgeCursor({ x: 1, y: -1 })).toBe('nesw-resize')
  })

  it('compares armed edges without allocating', () => {
    expect(sameResizeEdge({ x: 1, y: 0 }, { x: 1, y: 0 })).toBe(true)
    expect(sameResizeEdge({ x: 1, y: 0 }, { x: 1, y: 1 })).toBe(false)
    expect(sameResizeEdge(null, null)).toBe(true)
    expect(sameResizeEdge(null, { x: 1, y: 0 })).toBe(false)
  })
})

describe('outward growth', () => {
  it('reads pointer travel as bigger or smaller per the side being dragged', () => {
    // Pulling the left edge leftward is negative travel but positive growth.
    expect(outwardGrowth({ x: -1, y: 0 }, -30, 50)).toEqual({ x: 30, y: 0 })
    expect(outwardGrowth({ x: 1, y: 1 }, 30, 40)).toEqual({ x: 30, y: 40 })
    // A pinned axis contributes nothing, which is what makes a side drag a
    // one-axis intent and a corner drag a two-axis one.
    expect(outwardGrowth({ x: 0, y: 1 }, 500, 10)).toEqual({ x: 0, y: 10 })
  })
})

describe('anchoring', () => {
  const origin = { x: 100, y: 100 }

  it('pins the side the gesture is not dragging', () => {
    // Dragging the right edge: the origin never moves.
    expect(anchoredOrigin(origin, CARD, { width: 500, height: 300 }, { x: 1, y: 0 }))
      .toEqual({ x: 100, y: 100 })
    // Dragging the left edge: the right edge stays at 500, so the origin walks.
    expect(anchoredOrigin(origin, CARD, { width: 500, height: 300 }, { x: -1, y: 0 }))
      .toEqual({ x: 0, y: 100 })
    expect(anchoredOrigin(origin, CARD, { width: 400, height: 400 }, { x: 0, y: -1 }))
      .toEqual({ x: 100, y: 0 })
  })

  it('re-centres a state change on the box it replaces', () => {
    expect(recenteredOrigin(origin, CARD, { width: 80, height: 80 }))
      .toEqual({ x: 260, y: 210 })
  })

  it('makes a state round trip land exactly where it started', () => {
    const icon = { width: 80, height: 80 }
    const shrunk = recenteredOrigin(origin, CARD, icon)
    expect(recenteredOrigin(shrunk, icon, CARD)).toEqual(origin)
  })
})
