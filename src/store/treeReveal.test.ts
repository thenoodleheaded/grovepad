import { describe, expect, it } from 'vitest'
import { buildTreeRevealSchedule } from './treeReveal'

describe('tree reveal choreography', () => {
  it('draws a branch before its widgets and groups only after its members', () => {
    const schedule = buildTreeRevealSchedule([
      { widgetIds: ['root-a', 'root-b'], groupId: 'root-group' },
      { widgetIds: ['child-a', 'child-b'], groupId: 'child-group', relationId: 'branch' },
    ])

    expect(schedule.widgetDelays.get('root-a')).toBeLessThan(schedule.widgetDelays.get('root-b')!)
    expect(schedule.groupDelays.get('root-group')).toBeGreaterThan(schedule.widgetDelays.get('root-b')!)
    expect(schedule.relationDelays.get('branch')).toBeGreaterThan(schedule.groupDelays.get('root-group')!)
    expect(schedule.relationDelays.get('branch')).toBeLessThan(schedule.widgetDelays.get('child-a')!)
    expect(schedule.groupDelays.get('child-group')).toBeGreaterThan(schedule.widgetDelays.get('child-b')!)
  })

  it('compresses very large trees into a bounded visual wait', () => {
    const schedule = buildTreeRevealSchedule(Array.from({ length: 80 }, (_, index) => ({
      widgetIds: [`widget-${index}`],
      relationId: index === 0 ? undefined : `relation-${index}`,
    })))
    expect(schedule.totalMs).toBeLessThanOrEqual(5_200)
  })
})
