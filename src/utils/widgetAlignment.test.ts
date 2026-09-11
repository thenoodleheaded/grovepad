import { describe, expect, it } from 'vitest'
import { alignUnitDeltas, distributeUnitDeltas, type MoveUnit } from './widgetAlignment'

const unit = (id: string, x: number, y: number, width = 100, height = 80): MoveUnit => ({
  ids: [id],
  bounds: { x, y, width, height },
})

describe('alignUnitDeltas', () => {
  it('returns nothing for fewer than two units', () => {
    expect(alignUnitDeltas([unit('a', 10, 10)], 'left').size).toBe(0)
  })

  it('aligns left edges to the leftmost unit', () => {
    const deltas = alignUnitDeltas([unit('a', 10, 0), unit('b', 50, 100)], 'left')
    expect(deltas.get('b')).toEqual({ dx: -40, dy: 0 })
    expect(deltas.has('a')).toBe(false)
  })

  it('aligns right edges to the rightmost edge', () => {
    const deltas = alignUnitDeltas([unit('a', 0, 0, 100), unit('b', 50, 100, 200)], 'right')
    // rightmost edge is b at 250; a's right edge is 100 -> dx 150
    expect(deltas.get('a')).toEqual({ dx: 150, dy: 0 })
    expect(deltas.has('b')).toBe(false)
  })

  it('centers horizontally on the selection center', () => {
    const deltas = alignUnitDeltas([unit('a', 0, 0, 100), unit('b', 200, 0, 100)], 'center-h')
    // span 0..300, center 150; a center 50 -> +100, b center 250 -> -100
    expect(deltas.get('a')).toEqual({ dx: 100, dy: 0 })
    expect(deltas.get('b')).toEqual({ dx: -100, dy: 0 })
  })

  it('aligns tops and bottoms on the vertical axis only', () => {
    const top = alignUnitDeltas([unit('a', 0, 10), unit('b', 0, 90)], 'top')
    expect(top.get('b')).toEqual({ dx: 0, dy: -80 })
    const bottom = alignUnitDeltas([unit('a', 0, 0, 100, 50), unit('b', 0, 100, 100, 80)], 'bottom')
    // bottom edge: max(50, 180) = 180; a bottom 50 -> dy 130
    expect(bottom.get('a')).toEqual({ dx: 0, dy: 130 })
  })

  it('moves every id in a multi-widget unit by the same delta', () => {
    const cluster: MoveUnit = { ids: ['a', 'b'], bounds: { x: 40, y: 0, width: 200, height: 100 } }
    const deltas = alignUnitDeltas([cluster, unit('c', 0, 200)], 'left')
    expect(deltas.get('a')).toEqual({ dx: -40, dy: 0 })
    expect(deltas.get('b')).toEqual({ dx: -40, dy: 0 })
  })
})

describe('distributeUnitDeltas', () => {
  it('returns nothing for fewer than three units', () => {
    expect(distributeUnitDeltas([unit('a', 0, 0), unit('b', 500, 0)], 'horizontal').size).toBe(0)
  })

  it('equalizes horizontal gaps, keeping the outermost units fixed', () => {
    const deltas = distributeUnitDeltas(
      [unit('a', 0, 0, 100), unit('b', 120, 0, 100), unit('c', 500, 0, 100)],
      'horizontal',
    )
    // span 0..600, widths 300, free 300, gap 150 -> b should start at 250
    expect(deltas.has('a')).toBe(false)
    expect(deltas.get('b')).toEqual({ dx: 130, dy: 0 })
    expect(deltas.has('c')).toBe(false)
  })

  it('distributes vertically along y', () => {
    const deltas = distributeUnitDeltas(
      [unit('a', 0, 0, 100, 100), unit('b', 0, 110, 100, 100), unit('c', 0, 500, 100, 100)],
      'vertical',
    )
    // span 0..600, heights 300, gap 150 -> b starts at 250
    expect(deltas.get('b')).toEqual({ dx: 0, dy: 140 })
  })

  it('leaves already-even overlapping units untouched (negative gap)', () => {
    const deltas = distributeUnitDeltas(
      [unit('a', 0, 0, 200), unit('b', 50, 0, 200), unit('c', 100, 0, 200)],
      'horizontal',
    )
    // span 0..300, widths 600, gap (300-600)/2 = -150: cursor lands exactly on
    // each unit's current start, so nothing needs to move.
    expect(deltas.size).toBe(0)
  })
})
