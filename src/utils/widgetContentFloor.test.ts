import { describe, expect, it } from 'vitest'
import { composePanelFloors, hasSignificantVerticalOverflow, panelClassForIsland, verticalContentFloor } from './widgetContentFloor'

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

  it('ignores sub-grid overflow noise that would otherwise cause grow loops', () => {
    expect(hasSignificantVerticalOverflow(4)).toBe(false)
    expect(hasSignificantVerticalOverflow(4.01)).toBe(true)
  })

  it('derives an idempotent height from content instead of repeatedly adding overflow', () => {
    expect(verticalContentFloor(450, 190)).toBe(476)
    expect(verticalContentFloor(450, 190)).toBe(476)
    expect(verticalContentFloor(470, 190, 120, 0)).toBe(472)
    expect(verticalContentFloor(260, 4, 280)).toBe(280)
  })
})
