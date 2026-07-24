import { describe, expect, it } from 'vitest'
import { buildTreeRevealSchedule } from './treeReveal'

describe('tree reveal choreography', () => {
  it('draws a branch before its widgets', () => {
    const schedule = buildTreeRevealSchedule([
      { widgetIds: ['root-a', 'root-b'] },
      { widgetIds: ['child-a', 'child-b'], relationId: 'branch' },
    ])

    expect(schedule.widgetDelays.get('root-a')).toBeLessThan(schedule.widgetDelays.get('root-b')!)
    expect(schedule.relationDelays.get('branch')).toBeGreaterThan(schedule.widgetDelays.get('root-b')!)
    expect(schedule.relationDelays.get('branch')).toBeLessThan(schedule.widgetDelays.get('child-a')!)
  })

  it('compresses very large trees into a bounded visual wait', () => {
    const schedule = buildTreeRevealSchedule(Array.from({ length: 80 }, (_, index) => ({
      widgetIds: [`widget-${index}`],
      relationId: index === 0 ? undefined : `relation-${index}`,
    })))
    expect(schedule.totalMs).toBeLessThanOrEqual(5_200)
  })
})
