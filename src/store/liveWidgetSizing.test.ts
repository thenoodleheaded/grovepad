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
})
