import { describe, expect, it } from 'vitest'
import {
  donutSegments,
  sampleSeries,
  SAMPLE_LIMIT,
  sparklineBars,
  sparklinePath,
} from './sparkline'

describe('sampleSeries', () => {
  it('passes short series through untouched', () => {
    expect(sampleSeries([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('bounds long series and keeps both endpoints', () => {
    const long = Array.from({ length: 500 }, (_, i) => i)
    const sampled = sampleSeries(long)
    expect(sampled).toHaveLength(SAMPLE_LIMIT)
    expect(sampled[0]).toBe(0)
    expect(sampled.at(-1)).toBe(499)
  })
})

describe('sparklinePath', () => {
  it('is empty for an empty series', () => {
    expect(sparklinePath([], 100, 20)).toBe('')
  })

  it('draws a flat mid-line for one point', () => {
    expect(sparklinePath([7], 100, 20)).toBe('M 0 10 L 100 10')
  })

  it('draws a flat mid-line when every value is equal', () => {
    // Never collapse onto an edge — a steady series should read as steady.
    expect(sparklinePath([5, 5, 5], 100, 20)).toBe('M 0 10 L 50 10 L 100 10')
  })

  it('maps the lowest value to the floor and the highest to the ceiling', () => {
    expect(sparklinePath([0, 10], 100, 20)).toBe('M 0 20 L 100 0')
  })

  it('stays bounded for a long series', () => {
    const path = sparklinePath(Array.from({ length: 800 }, (_, i) => i), 100, 20)
    expect(path.split('L')).toHaveLength(SAMPLE_LIMIT)
  })
})

describe('sparklineBars', () => {
  it('is empty for an empty series', () => {
    expect(sparklineBars([], 100, 20)).toEqual([])
  })

  it('scales bar height against the zero baseline', () => {
    const bars = sparklineBars([{ value: 0 }, { value: 10 }], 100, 20, 0)
    expect(bars).toHaveLength(2)
    expect(bars[0]!.height).toBe(1) // hairline, never an empty slot
    expect(bars[1]!.height).toBe(20)
    expect(bars[1]!.y).toBe(0)
  })

  it('draws negatives below the baseline rather than flattening them', () => {
    const [negative, positive] = sparklineBars([{ value: -5 }, { value: 5 }], 100, 20, 0)
    expect(negative!.y).toBe(10)
    expect(negative!.height).toBe(10)
    expect(positive!.y).toBe(0)
    expect(positive!.height).toBe(10)
  })

  it('carries per-bar color through and bounds the mark count', () => {
    expect(sparklineBars([{ value: 1, color: '#f00' }], 100, 20)[0]!.color).toBe('#f00')
    const many = Array.from({ length: 300 }, (_, i) => ({ value: i }))
    expect(sparklineBars(many, 100, 20)).toHaveLength(SAMPLE_LIMIT)
  })
})

describe('donutSegments', () => {
  it('is empty when nothing is positive', () => {
    expect(donutSegments([])).toEqual([])
    expect(donutSegments([{ value: 0 }, { value: -3 }])).toEqual([])
  })

  it('splits the positive total into accumulating arcs', () => {
    const segments = donutSegments([{ value: 3 }, { value: 1 }])
    expect(segments).toEqual([
      { fraction: 0.75, offset: 0, color: undefined },
      { fraction: 0.25, offset: 0.75, color: undefined },
    ])
  })

  it('ignores negatives when computing shares', () => {
    const segments = donutSegments([{ value: 5 }, { value: -5 }])
    expect(segments).toHaveLength(1)
    expect(segments[0]!.fraction).toBe(1)
  })
})
