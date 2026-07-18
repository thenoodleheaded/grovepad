import { describe, expect, it } from 'vitest'
import {
  contentFloorAnomalies,
  detectOscillation,
  domStoreMismatch,
  resizeAnomalies,
} from './scaleDebugAnomalies'

describe('resizeAnomalies', () => {
  it('flags nothing for a resize that lands cleanly inside its bounds', () => {
    expect(resizeAnomalies(
      { width: 320, height: 200 },
      { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
      { snapped: true, locked: false, changed: true },
    )).toEqual([])
  })

  it('catches NaN and non-finite sizes before any bound check can misfire', () => {
    expect(resizeAnomalies({ width: Number.NaN, height: 200 }, {})).toEqual(['nan-size'])
    expect(resizeAnomalies({ width: Infinity, height: 200 }, {})).toEqual(['non-finite-size'])
  })

  it('flags a zero or negative size', () => {
    expect(resizeAnomalies({ width: 0, height: 100 }, {})).toContain('non-positive-size')
    expect(resizeAnomalies({ width: -10, height: 100 }, {})).toContain('non-positive-size')
  })

  it('flags a size outside its own registry-derived bounds', () => {
    const bounds = { minWidth: 200, minHeight: 120, maxWidth: 640, maxHeight: 480 }
    expect(resizeAnomalies({ width: 150, height: 200 }, bounds)).toEqual(['below-min-width'])
    expect(resizeAnomalies({ width: 300, height: 80 }, bounds)).toEqual(['below-min-height'])
    expect(resizeAnomalies({ width: 700, height: 200 }, bounds)).toEqual(['above-max-width'])
    expect(resizeAnomalies({ width: 300, height: 600 }, bounds)).toEqual(['above-max-height'])
  })

  it('tolerates half-pixel float noise at a bound instead of flagging it', () => {
    const bounds = { minWidth: 200, maxWidth: 640 }
    expect(resizeAnomalies({ width: 199.6, height: 100 }, bounds)).toEqual([])
    expect(resizeAnomalies({ width: 640.4, height: 100 }, bounds)).toEqual([])
  })

  it('flags an unsnapped size only when the caller asked for snapping', () => {
    expect(resizeAnomalies({ width: 321, height: 200 }, {}, { snapped: true, locked: false, changed: true }))
      .toContain('not-grid-snapped')
    expect(resizeAnomalies({ width: 321, height: 200 }, {}, { snapped: false, locked: false, changed: true }))
      .not.toContain('not-grid-snapped')
  })

  it('flags a locked widget whose size changed anyway', () => {
    expect(resizeAnomalies({ width: 320, height: 200 }, {}, { snapped: false, locked: true, changed: true }))
      .toContain('locked-but-resized')
    expect(resizeAnomalies({ width: 320, height: 200 }, {}, { snapped: false, locked: true, changed: false }))
      .not.toContain('locked-but-resized')
  })
})

describe('contentFloorAnomalies', () => {
  it('flags a card whose empty bottom exceeds one grid cell', () => {
    expect(contentFloorAnomalies({ cardHeight: 576, naturalHeight: 263, inset: 24, overflowY: 0, autoHeight: false }))
      .toContain('content-void')
  })

  it('does not flag a card that already fits its content', () => {
    expect(contentFloorAnomalies({ cardHeight: 300, naturalHeight: 270, inset: 24, overflowY: 0, autoHeight: false }))
      .toEqual([])
  })

  it('never flags a void on an autoHeight card — it fits every pass by construction', () => {
    expect(contentFloorAnomalies({ cardHeight: 576, naturalHeight: 263, inset: 24, overflowY: 0, autoHeight: true }))
      .toEqual([])
  })

  it('flags real overflow that the card has not grown to absorb', () => {
    // The card (200) is shorter than its own natural content (300 + 24 inset)
    // and something inside is genuinely clipping — the grow floor missed it.
    expect(contentFloorAnomalies({ cardHeight: 200, naturalHeight: 300, inset: 24, overflowY: 100, autoHeight: false }))
      .toContain('overflow-not-grown')
  })
})

describe('detectOscillation', () => {
  it('is silent for a monotonic grow or shrink', () => {
    expect(detectOscillation([200, 240, 280, 320], 500, 1000)).toBe(false)
  })

  it('is silent for too few samples even if they alternate', () => {
    expect(detectOscillation([200, 320], 500, 1000)).toBe(false)
  })

  it('is silent outside its own time window', () => {
    expect(detectOscillation([200, 320, 200, 320], 2000, 1000)).toBe(false)
  })

  it('flags a size fighting itself — grow, shrink, grow again', () => {
    expect(detectOscillation([200, 320, 200, 320], 500, 1000)).toBe(true)
  })
})

describe('domStoreMismatch', () => {
  it('is null when the rendered box matches the store size at the current zoom', () => {
    expect(domStoreMismatch({ width: 640, height: 400 }, { width: 320, height: 200 }, 2)).toBeNull()
  })

  it('reports the world-space delta once it exceeds tolerance', () => {
    expect(domStoreMismatch({ width: 700, height: 400 }, { width: 320, height: 200 }, 2))
      .toEqual({ width: 30, height: 0 })
  })

  it('is not fooled by zoom alone — the same screen box reads differently at different zoom', () => {
    expect(domStoreMismatch({ width: 320, height: 200 }, { width: 320, height: 200 }, 1)).toBeNull()
    expect(domStoreMismatch({ width: 320, height: 200 }, { width: 320, height: 200 }, 0.5)).not.toBeNull()
  })
})
