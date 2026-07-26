import { describe, expect, it } from 'vitest'
import type { BarChartData } from '../types/spatial'
import { dataWearingSkin } from '../utils/widgetSkins'
import { widgetDefinition } from './registry'

describe('Chart widget skins', () => {
  it('offers all eleven visualization experiences in deliberate order', () => {
    const definition = widgetDefinition('bar_chart')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'bar',
      'line',
      'donut',
      'pie',
      'area',
      'sparkline',
      'gauge',
      'progress_ring',
      'heatmap',
      'scatter',
      'stacked',
    ])
  })

  it('keeps specialist heatmap, scatter, and stack controls inside the renderer', () => {
    expect(widgetDefinition('bar_chart').rendererOwnedSkinDetails).toEqual([
      'heatmap',
      'scatter',
      'stacked',
    ])
  })

  it('changes only the visualization while preserving the canonical series', () => {
    const definition = widgetDefinition('bar_chart')
    const original = definition.defaultData() as BarChartData
    const scatter = dataWearingSkin(
      { type: 'bar_chart', data: original },
      'scatter',
      definition,
    ) as BarChartData
    expect(scatter.mode).toBe('scatter')
    expect(scatter.bars).toEqual(original.bars)
    expect(scatter.title).toBe(original.title)
  })
})
