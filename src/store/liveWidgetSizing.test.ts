import { describe, expect, it } from 'vitest'
import { mergeWidgetSizing } from './liveWidgetSizing'

describe('live widget sizing', () => {
  it('lets mounted content raise static minima without loosening them', () => {
    expect(
      mergeWidgetSizing(
        { minWidth: 240, minHeight: 120, maxWidth: 640, autoHeight: true },
        { minWidth: 292, minHeight: 96 },
      ),
    ).toEqual({ minWidth: 292, minHeight: 120, maxWidth: 640, autoHeight: true })
  })
})
