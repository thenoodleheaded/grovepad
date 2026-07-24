import { describe, expect, it } from 'vitest'
import { GRID_SIZE, type Widget } from '../types/spatial'
import { settleWidgetLayout } from './widgetSettling'

/** A pinned notes card, so its settle box is its stored rectangle rather than a
 * content-derived resting tile. */
function card(id: string, x: number, y: number, width = 160, height = 80): Widget {
  return {
    id,
    canvasId: 'c1',
    type: 'notes',
    title: id,
    position: { x, y },
    size: { width, height },
    data: { text: '' },
    metadata: { badges: [], pinned: true },
  }
}

const board = (...cards: Widget[]): Record<string, Widget> =>
  Object.fromEntries(cards.map((c) => [c.id, c]))

describe('settle push-apart distance', () => {
  it('leaves neighbours alone when a drop merely lands NEAR them', () => {
    // `b` sits a hair to the right of `a` with real daylight between them but
    // less than the old LAYOUT_GAP. Nothing overlaps, so nothing may move —
    // this near-miss used to shove `b` a whole cell, and that shove cascaded.
    const a = card('a', 0, 0)
    const b = card('b', 160 + 20, 0)
    const settled = settleWidgetLayout(board(a, b), ['a'], {})
    expect(settled.a!.position).toEqual({ x: 0, y: 0 })
    expect(settled.b!.position).toEqual({ x: 180, y: 0 })
  })

  it('separates a genuine overlap by the fewest whole cells that clear it', () => {
    // `b` overlaps `a` by 40px horizontally (and fully vertically).
    const a = card('a', 0, 0)
    const b = card('b', 120, 0)
    const settled = settleWidgetLayout(board(a, b), ['a'], {})

    const left = settled.a!
    const right = settled.b!
    const gap = right.position.x - (left.position.x + left.size.width)
    // Cleared, on the grid, and by no more than one cell of slack.
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThanOrEqual(GRID_SIZE)
    expect(right.position.x % GRID_SIZE).toBe(0)
    // The widget being settled around holds its ground.
    expect(left.position).toEqual({ x: 0, y: 0 })
  })

  it('does not walk a row of neighbours several cells away from one drop', () => {
    // A dropped card overlapping the first of a row must not cascade a
    // full-cell shove down the whole line.
    const a = card('a', 0, 0)
    const b = card('b', 200, 0)
    const c = card('c', 400, 0)
    const settled = settleWidgetLayout(board(a, b, c), ['a'], {})
    // `c` was never overlapped by anything, so it must not have moved at all.
    expect(settled.c!.position).toEqual({ x: 400, y: 0 })
    expect(settled.b!.position).toEqual({ x: 200, y: 0 })
  })

  it('resolves a full stack without leaving the cards overlapping', () => {
    const a = card('a', 0, 0)
    const b = card('b', 0, 0)
    const settled = settleWidgetLayout(board(a, b), ['a'], {})
    const ra = settled.a!
    const rb = settled.b!
    const clearX =
      rb.position.x >= ra.position.x + ra.size.width || ra.position.x >= rb.position.x + rb.size.width
    const clearY =
      rb.position.y >= ra.position.y + ra.size.height || ra.position.y >= rb.position.y + rb.size.height
    expect(clearX || clearY).toBe(true)
  })
})

describe('anchored settling — the widget you acted on holds its ground', () => {
  it('moves the neighbour out of the way, never the anchored widget', () => {
    const a = card('a', 0, 0)
    const b = card('b', 120, 0)
    const settled = settleWidgetLayout(board(a, b), ['a'], {}, { anchorIds: ['a'] })
    // `a` is exactly where it was put; `b` gave way.
    expect(settled.a!.position).toEqual({ x: 0, y: 0 })
    expect(settled.b!.position).not.toEqual({ x: 120, y: 0 })
    const gap = settled.b!.position.x - (settled.a!.position.x + settled.a!.size.width)
    expect(gap).toBeGreaterThan(0)
  })

  it('does not grid-snap an anchored widget off its exact spot', () => {
    // A pinned/expanded card can legitimately rest off-grid. The check must
    // not quietly round it — that is the diagonal-jump bug in another guise.
    const a = card('a', -20, 60)
    const b = card('b', 900, 900)
    const settled = settleWidgetLayout(board(a, b), ['a'], {}, { anchorIds: ['a'] })
    expect(settled.a!.position).toEqual({ x: -20, y: 60 })
  })

  it('terminates when an anchored widget cannot be pushed', () => {
    // Two anchored cards stacked on each other have no legal resolution; the
    // pass must give up rather than spin to the iteration limit re-queueing.
    const a = card('a', 0, 0)
    const b = card('b', 0, 0)
    const settled = settleWidgetLayout(board(a, b), ['a', 'b'], {}, { anchorIds: ['a', 'b'] })
    expect(settled.a!.position).toEqual({ x: 0, y: 0 })
    expect(settled.b!.position).toEqual({ x: 0, y: 0 })
  })
})
