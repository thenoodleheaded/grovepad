import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BarChartData } from '../../../types/spatial'
import { BarChartWidget } from './BarChartWidget'
import type { ChartSkin } from './chartSkinModel'

describe('purpose-built Chart skins', () => {
  const base: BarChartData = {
    title: 'Revenue',
    unit: '$',
    bars: [
      { id: 'one', label: 'Jan', value: 30, color: '#38bdf8' },
      { id: 'two', label: 'Feb', value: 55, color: '#a3e635' },
      { id: 'three', label: 'Mar', value: 42, color: '#f472b6' },
    ],
    mode: 'bar',
  }

  it.each([
    ['bar', 'gp-chart-bars'],
    ['line', 'gp-chart-line'],
    ['donut', 'gp-chart-donut'],
    ['pie', 'gp-chart-pie'],
    ['area', 'gp-chart-area'],
    ['sparkline', 'gp-chart-sparkline'],
    ['gauge', 'gp-chart-gauge'],
    ['progress_ring', 'gp-chart-progress'],
    ['heatmap', 'gp-chart-heatmap'],
    ['scatter', 'gp-chart-scatter'],
    ['stacked', 'gp-chart-stacked'],
  ] as const)('renders the %s experience with its own anatomy', (mode, className) => {
    const markup = renderToStaticMarkup(
      <BarChartWidget
        data={{ ...base, mode: mode as ChartSkin }}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-chart-skin="${mode}"`)
    expect(markup).toContain('aria-label="Edit chart data"')
  })

  it('renders advanced coordinates, gauge targets, and stacked series from isolated state', () => {
    const scatter = renderToStaticMarkup(
      <BarChartWidget
        data={{
          ...base,
          mode: 'scatter',
          skinStates: { scatter: { xValues: { one: 10, two: 20, three: 30 } } },
        }}
        onChange={() => undefined}
      />,
    )
    const gauge = renderToStaticMarkup(
      <BarChartWidget
        data={{
          ...base,
          mode: 'gauge',
          skinStates: { gauge: { min: 0, max: 60, target: 50 } },
        }}
        onChange={() => undefined}
      />,
    )
    const stacked = renderToStaticMarkup(
      <BarChartWidget
        data={{
          ...base,
          mode: 'stacked',
          skinStates: {
            stacked: {
              series: [{
                id: 'plan',
                name: 'Plan',
                color: '#a78bfa',
                values: { one: 10, two: 20, three: 30 },
              }],
            },
          },
        }}
        onChange={() => undefined}
      />,
    )
    expect(scatter).toContain('x 10, y 30')
    expect(gauge).toContain('Target 50')
    expect(stacked).toContain('Plan')
    expect(stacked).toContain('2 series')
  })
})
