import { describe, expect, it } from 'vitest'
import { interactiveResidentWidgetIds } from './widgetResidency'

describe('widget residency', () => {
  it('wakes one selected editor but keeps marquee selections passive', () => {
    expect([...interactiveResidentWidgetIds({
      renderedIds: ['a', 'b', 'c'],
      pinnedIds: new Set(),
      selectedIds: new Set(['b']),
      circuitMode: false,
    })]).toEqual(['b'])
    expect(interactiveResidentWidgetIds({
      renderedIds: ['a', 'b', 'c'],
      pinnedIds: new Set(),
      selectedIds: new Set(['a', 'b']),
      circuitMode: false,
    }).size).toBe(0)
  })

  it('keeps every rendered card interactive in circuit mode', () => {
    expect([...interactiveResidentWidgetIds({
      renderedIds: ['a', 'b', 'c'],
      pinnedIds: new Set(),
      selectedIds: new Set(),
      circuitMode: true,
    })]).toEqual(['a', 'b', 'c'])
  })
})
