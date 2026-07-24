import { afterEach, describe, expect, it } from 'vitest'
import { clearLiveWidgetSizing, getLiveWidgetSizing, mergeWidgetSizing, setLiveWidgetSizing } from './liveWidgetSizing'

afterEach(() => clearLiveWidgetSizing('widget'))

describe('live widget sizing', () => {
  it('lets mounted content raise fallback minima without loosening ceilings', () => {
    setLiveWidgetSizing('widget', { minWidth: 332, minHeight: 196 })
    expect(getLiveWidgetSizing('widget')).toEqual({ minWidth: 332, minHeight: 196 })
    expect(mergeWidgetSizing(
      { minWidth: 240, minHeight: 120, maxWidth: 640, maxHeight: 520, autoHeight: true },
      getLiveWidgetSizing('widget'),
    )).toEqual({ minWidth: 332, minHeight: 196, maxWidth: 640, maxHeight: 520, autoHeight: true })
  })

  it('lets a measured ceiling tighten a registry maximum', () => {
    // A card of fixed-height rows cannot usefully be dragged taller than its
    // own content, so the measured ceiling wins when it is the smaller one.
    setLiveWidgetSizing('widget', { minWidth: 240, minHeight: 120, maxHeight: 300 })
    expect(mergeWidgetSizing(
      { minWidth: 240, minHeight: 120, maxWidth: 640, maxHeight: 1280 },
      getLiveWidgetSizing('widget'),
    ).maxHeight).toBe(300)
  })

  it('never lets a measured ceiling loosen a registry maximum', () => {
    // Only a content author widens a type's useful range.
    setLiveWidgetSizing('widget', { maxHeight: 5000 })
    expect(mergeWidgetSizing(
      { minWidth: 240, minHeight: 120, maxWidth: 640, maxHeight: 520 },
      getLiveWidgetSizing('widget'),
    ).maxHeight).toBe(520)
  })

  it('carries a measured ceiling through when the type declares none', () => {
    // The reported case: a type with no sizing entry at all (tracker) fell
    // back to the generic 1280 window and could be dragged into a huge void.
    setLiveWidgetSizing('widget', { minHeight: 200, maxHeight: 360 })
    expect(mergeWidgetSizing(undefined, getLiveWidgetSizing('widget')).maxHeight).toBe(360)
  })
})
