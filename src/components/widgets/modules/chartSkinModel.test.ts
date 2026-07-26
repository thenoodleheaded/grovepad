import { describe, expect, it } from 'vitest'
import type { BarChartData } from '../../../types/spatial'
import {
  areaPath,
  chartDomain,
  chartSkin,
  chartTrend,
  gaugeState,
  heatmapState,
  linePath,
  plotPoints,
  positiveShares,
  scatterState,
  stackedState,
} from './chartSkinModel'

const bars: BarChartData['bars'] = [
  { id: 'a', label: 'A', value: 3, color: '#38bdf8' },
  { id: 'b', label: 'B', value: 5, color: '#a3e635' },
]

describe('Chart skin model', () => {
  it('builds finite domains with a stable zero baseline', () => {
    expect(chartDomain([-5, 5])).toEqual({
      min: -5,
      max: 5,
      span: 10,
      zeroRatio: 0.5,
    })
    expect(chartDomain([5, 5], false)).toEqual({
      min: 4,
      max: 6,
      span: 2,
      zeroRatio: 3,
    })
  })

  it('maps line and area paths into a bounded plot', () => {
    const points = plotPoints([0, 10], 100, 50, 10, 5)
    expect(points).toEqual([{ x: 10, y: 45 }, { x: 90, y: 5 }])
    expect(linePath(points)).toBe('M 10 45 L 90 5')
    expect(areaPath(points, 45)).toBe('M 10 45 L 90 5 L 90 45 L 10 45 Z')
  })

  it('reports trends and positive shares without dividing by zero', () => {
    expect(chartTrend([10, 15])).toEqual({
      delta: 5,
      percent: 50,
      direction: 'up',
    })
    expect(chartTrend([0, 4])).toEqual({
      delta: 4,
      percent: null,
      direction: 'up',
    })
    expect(positiveShares([3, -2, 1])).toEqual([
      { fraction: 0.75, offset: 0 },
      { fraction: 0, offset: 0.75 },
      { fraction: 0.25, offset: 0.75 },
    ])
  })

  it('sanitizes specialist scatter, gauge, heatmap, and stack state', () => {
    expect(scatterState({ xValues: { a: 12, b: 'bad' } }, bars)).toEqual({
      xValues: { a: 12, b: 2 },
    })
    expect(gaugeState({ min: 10, max: 10, target: 99 }, [3, 5])).toEqual({
      min: 10,
      max: 11,
      target: 11,
    })
    expect(heatmapState({ columns: 40 })).toEqual({ columns: 12 })
    expect(stackedState({
      series: [
        {
          id: 'comparison',
          name: 'Plan',
          color: '#f472b6',
          values: { a: 4, b: Number.NaN, stale: 9 },
        },
        { id: 'comparison', name: 'Duplicate', values: {} },
      ],
    }, bars)).toEqual({
      series: [
        {
          id: 'comparison',
          name: 'Plan',
          color: '#f472b6',
          values: { a: 4 },
        },
      ],
    })
    expect(chartSkin('unknown')).toBe('bar')
  })
})
