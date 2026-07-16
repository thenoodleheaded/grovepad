import { describe, expect, it } from 'vitest'
import { composePanelFloors, panelClassForIsland } from './widgetContentFloor'

describe('widget content floors', () => {
  it('adds side-by-side panels and stacks vertical panels', () => {
    const panels = [{ width: 120, height: 80 }, { width: 180, height: 120 }]
    expect(composePanelFloors(panels, 'row', 8, 24, 24)).toEqual({ width: 332, height: 144 })
    expect(composePanelFloors(panels, 'column', 8, 24, 24)).toEqual({ width: 204, height: 232 })
  })

  it('maps focus island behavior to the matching whole-card floor class', () => {
    expect(panelClassForIsland('free')).toBe('reflow')
    expect(panelClassForIsland('width')).toBe('controls')
    expect(panelClassForIsland('aspect')).toBe('rigid')
    expect(panelClassForIsland('fixed')).toBe('rigid')
  })
})

