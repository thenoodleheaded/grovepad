import { describe, expect, it } from 'vitest'
import type { MetricsData } from '../../../types/spatial'
import {
  deltaState,
  executiveState,
  freshnessLabel,
  metricDelta,
  metricNumber,
  metricSummary,
  metricTarget,
  metricsSkin,
  targetState,
} from './metricsSkinModel'

const tiles: MetricsData['tiles'] = [
  { id: 'users', label: 'Users', value: '1,250', unit: '', trend: 'up' },
  { id: 'revenue', label: 'Revenue', value: '300', unit: 'k', trend: 'flat' },
  { id: 'churn', label: 'Churn', value: '4.5', unit: '%', trend: 'down' },
]

describe('Metrics skin model', () => {
  it('falls back to KPI tiles and parses display-friendly numbers', () => {
    expect(metricsSkin('unknown')).toBe('kpi_tiles')
    expect(metricsSkin('target')).toBe('target')
    expect(metricNumber('1,250.5')).toBe(1250.5)
    expect(metricNumber('')).toBeNull()
    expect(metricNumber('not a number')).toBeNull()
  })

  it('summarizes the shared tile collection', () => {
    expect(metricSummary(tiles)).toEqual({
      numericCount: 3,
      total: 1554.5,
      positive: 1,
      negative: 1,
      flat: 1,
    })
  })

  it('sanitizes comparison state and calculates absolute and percentage deltas', () => {
    const state = deltaState({
      previousValues: { users: 1000, orphan: '500' },
      period: 'Last quarter',
    }, tiles)
    expect(state.period).toBe('Last quarter')
    expect(state.previousValues).toEqual({
      users: '1000',
      revenue: '300',
      churn: '4.95',
    })
    expect(metricDelta('120', '100')).toEqual({
      value: 20,
      percent: 20,
      direction: 'up',
    })
    expect(metricDelta('10', '0')?.percent).toBeNull()
  })

  it('keeps targets bounded and reports progress and variance', () => {
    expect(targetState({ targets: { users: 2000, revenue: -50 } }, tiles)).toEqual({
      targets: { users: 2000, revenue: 0, churn: 6 },
    })
    expect(metricTarget('75', 100)).toEqual({
      target: 100,
      variance: -25,
      progress: 0.75,
      reached: false,
    })
    expect(metricTarget('120', 100)).toMatchObject({
      variance: 20,
      progress: 1,
      reached: true,
    })
  })

  it('sanitizes executive ownership and describes freshness in local days', () => {
    const state = executiveState({
      owners: { users: 'Growth', orphan: 'Nobody' },
      updatedAt: { users: '2026-07-24', revenue: 'invalid-date' },
    }, tiles)
    expect(state.owners).toEqual({
      users: 'Growth',
      revenue: 'Unassigned',
      churn: 'Unassigned',
    })
    expect(state.updatedAt).toEqual({
      users: '2026-07-24',
      revenue: '',
      churn: '',
    })
    const now = new Date(2026, 6, 25, 15)
    expect(freshnessLabel('2026-07-25', now)).toBe('Today')
    expect(freshnessLabel('2026-07-24', now)).toBe('Yesterday')
    expect(freshnessLabel('2026-07-20', now)).toBe('5d ago')
    expect(freshnessLabel('', now)).toBe('Live')
  })
})
