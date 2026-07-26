import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MetricsData } from '../../../types/spatial'
import { MetricsWidget } from './MetricsWidget'
import type { MetricsSkin } from './metricsSkinModel'

describe('purpose-built Metrics skins', () => {
  const base: MetricsData = {
    skin: 'kpi_tiles',
    tiles: [
      { id: 'users', label: 'Users', value: '120', unit: '', trend: 'up' },
      { id: 'revenue', label: 'Revenue', value: '300', unit: 'k', trend: 'flat' },
      { id: 'churn', label: 'Churn', value: '5', unit: '%', trend: 'down' },
    ],
  }

  it.each([
    ['kpi_tiles', 'gp-metrics-kpi-grid'],
    ['big_number', 'gp-metrics-big-number'],
    ['scoreboard', 'gp-metrics-scoreboard'],
    ['traffic_lights', 'gp-metrics-lights'],
    ['delta', 'gp-metrics-delta'],
    ['target', 'gp-metrics-targets'],
    ['executive_strip', 'gp-metrics-executive'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <MetricsWidget
        data={{ ...base, skin: skin as MetricsSkin }}
        skin={skin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-metrics-skin="${skin}"`)
    expect(markup).toContain('aria-label="Edit metrics"')
    expect(markup).toContain('3 metrics')
  })

  it('renders specialist comparison, goal, and ownership settings', () => {
    const delta = renderToStaticMarkup(
      <MetricsWidget
        data={{
          ...base,
          skin: 'delta',
          skinStates: {
            delta: {
              previousValues: { users: '100', revenue: '300', churn: '10' },
              period: 'Last month',
            },
          },
        }}
        skin="delta"
        onChange={() => undefined}
      />,
    )
    const targets = renderToStaticMarkup(
      <MetricsWidget
        data={{
          ...base,
          skin: 'target',
          skinStates: { target: { targets: { users: 200, revenue: 300, churn: 4 } } },
        }}
        skin="target"
        onChange={() => undefined}
      />,
    )
    const executive = renderToStaticMarkup(
      <MetricsWidget
        data={{
          ...base,
          skin: 'executive_strip',
          skinStates: {
            executive_strip: {
              owners: { users: 'Growth team' },
              updatedAt: { users: '2026-07-24' },
            },
          },
        }}
        skin="executive_strip"
        onChange={() => undefined}
      />,
    )
    expect(delta).toContain('Last month')
    expect(delta).toContain('+20')
    expect(targets).toContain('60%')
    expect(targets).toContain('data-reached="true"')
    expect(executive).toContain('value="Growth team"')
    expect(executive).toContain('2026-07-24')
  })
})
