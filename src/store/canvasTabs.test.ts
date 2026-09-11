import { describe, expect, it } from 'vitest'
import {
  closeCanvasTab,
  insertCanvasTab,
  neighbourCanvasTabId,
  reorderCanvasTabs,
  resolveCanvasTabs,
} from './canvasTabs'
import type { CanvasTab } from '../types/persistence'

const CANVASES = { root: {}, alpha: {}, beta: {} }

function mintSequence(...ids: string[]): () => string {
  let index = 0
  return () => ids[index++] ?? `overflow-${index}`
}

function tabs(...pairs: [string, string][]): CanvasTab[] {
  return pairs.map(([id, canvasId]) => ({ id, canvasId }))
}

describe('resolveCanvasTabs', () => {
  it('leaves a healthy row untouched', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root'], ['t2', 'alpha']), activeTabId: 't2', activeCanvasId: 'alpha' },
      CANVASES,
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root'], ['t2', 'alpha']))
    expect(result.activeTabId).toBe('t2')
    expect(result.activeCanvasId).toBe('alpha')
  })

  it('drops tabs whose canvas no longer exists', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root'], ['t2', 'gone'], ['t3', 'beta']), activeTabId: 't1', activeCanvasId: 'root' },
      CANVASES,
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root'], ['t3', 'beta']))
    expect(result.activeTabId).toBe('t1')
  })

  it('refills the active tab in place when its canvas is deleted', () => {
    // Undoing past a canvas creation: the board falls back to root, and the
    // tab the user was standing on must become root rather than jump to the end.
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'alpha'], ['t2', 'gone'], ['t3', 'beta']), activeTabId: 't2', activeCanvasId: 'root' },
      CANVASES,
      mintSequence('minted'),
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'alpha'], ['minted', 'root'], ['t3', 'beta']))
    expect(result.activeTabId).toBe('minted')
    expect(result.activeCanvasId).toBe('root')
  })

  it('reuses an existing tab for the fallback canvas instead of minting a duplicate', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root'], ['t2', 'gone']), activeTabId: 't2', activeCanvasId: 'root' },
      CANVASES,
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root']))
    expect(result.activeTabId).toBe('t1')
  })

  it('retargets the surviving active tab to follow the active canvas', () => {
    // A board load restores a different canvas than the tab row remembered.
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root'], ['t2', 'alpha']), activeTabId: 't1', activeCanvasId: 'beta' },
      CANVASES,
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'beta'], ['t2', 'alpha']))
    expect(result.activeTabId).toBe('t1')
  })

  it('rebuilds a row that was emptied entirely', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'gone'], ['t2', 'also-gone']), activeTabId: 't1', activeCanvasId: 'root' },
      CANVASES,
      mintSequence('minted'),
    )
    expect(result.openTabs).toEqual(tabs(['minted', 'root']))
    expect(result.activeTabId).toBe('minted')
  })

  it('falls back to a surviving tab when the active canvas is gone too', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'beta'], ['t2', 'gone']), activeTabId: 't2', activeCanvasId: 'gone' },
      CANVASES,
    )
    expect(result.activeCanvasId).toBe('beta')
    expect(result.activeTabId).toBe('t1')
    expect(result.openTabs).toEqual(tabs(['t1', 'beta']))
  })

  it('seeds a row from an empty one', () => {
    const result = resolveCanvasTabs(
      { openTabs: [], activeTabId: '', activeCanvasId: 'root' },
      CANVASES,
      mintSequence('minted'),
    )
    expect(result.openTabs).toEqual(tabs(['minted', 'root']))
    expect(result.activeTabId).toBe('minted')
  })

  it('discards duplicate tab ids from a corrupt payload', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root'], ['t1', 'alpha']), activeTabId: 't1', activeCanvasId: 'root' },
      CANVASES,
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root']))
  })

  it('degrades to an empty row when the board holds no canvases', () => {
    const result = resolveCanvasTabs(
      { openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' },
      {},
    )
    expect(result).toEqual({ openTabs: [], activeTabId: '', activeCanvasId: '' })
  })
})

describe('insertCanvasTab', () => {
  it('opens right of the active tab and activates it', () => {
    const result = insertCanvasTab(
      { openTabs: tabs(['t1', 'root'], ['t2', 'beta']), activeTabId: 't1', activeCanvasId: 'root' },
      'alpha',
      { mintTabId: mintSequence('minted') },
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root'], ['minted', 'alpha'], ['t2', 'beta']))
    expect(result.activeTabId).toBe('minted')
    expect(result.activeCanvasId).toBe('alpha')
  })

  it('opens in the background without moving the user', () => {
    const result = insertCanvasTab(
      { openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' },
      'alpha',
      { activate: false, mintTabId: mintSequence('minted') },
    )
    expect(result.activeTabId).toBe('t1')
    expect(result.activeCanvasId).toBe('root')
    expect(result.openTabs).toEqual(tabs(['t1', 'root'], ['minted', 'alpha']))
  })

  it('allows two tabs on the same canvas', () => {
    const result = insertCanvasTab(
      { openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' },
      'root',
      { mintTabId: mintSequence('minted') },
    )
    expect(result.openTabs).toEqual(tabs(['t1', 'root'], ['minted', 'root']))
    expect(result.activeTabId).toBe('minted')
  })
})

describe('closeCanvasTab', () => {
  it('refuses to close the last tab', () => {
    expect(
      closeCanvasTab({ openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' }, 't1'),
    ).toBeNull()
  })

  it('ignores an unknown tab', () => {
    expect(
      closeCanvasTab(
        { openTabs: tabs(['t1', 'root'], ['t2', 'alpha']), activeTabId: 't1', activeCanvasId: 'root' },
        'nope',
      ),
    ).toBeNull()
  })

  it('keeps the user in place when closing a background tab', () => {
    const result = closeCanvasTab(
      { openTabs: tabs(['t1', 'root'], ['t2', 'alpha']), activeTabId: 't1', activeCanvasId: 'root' },
      't2',
    )
    expect(result).toEqual({ openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' })
  })

  it('hands focus to the right neighbour', () => {
    const result = closeCanvasTab(
      { openTabs: tabs(['t1', 'root'], ['t2', 'alpha'], ['t3', 'beta']), activeTabId: 't2', activeCanvasId: 'alpha' },
      't2',
    )
    expect(result).toEqual({
      openTabs: tabs(['t1', 'root'], ['t3', 'beta']),
      activeTabId: 't3',
      activeCanvasId: 'beta',
    })
  })

  it('falls back to the left neighbour at the end of the row', () => {
    const result = closeCanvasTab(
      { openTabs: tabs(['t1', 'root'], ['t2', 'alpha']), activeTabId: 't2', activeCanvasId: 'alpha' },
      't2',
    )
    expect(result).toEqual({ openTabs: tabs(['t1', 'root']), activeTabId: 't1', activeCanvasId: 'root' })
  })
})

describe('neighbourCanvasTabId', () => {
  const row = tabs(['t1', 'root'], ['t2', 'alpha'], ['t3', 'beta'])

  it('steps forward and back', () => {
    expect(neighbourCanvasTabId(row, 't1', 1)).toBe('t2')
    expect(neighbourCanvasTabId(row, 't2', -1)).toBe('t1')
  })

  it('wraps around both ends', () => {
    expect(neighbourCanvasTabId(row, 't3', 1)).toBe('t1')
    expect(neighbourCanvasTabId(row, 't1', -1)).toBe('t3')
  })

  it('has nowhere to go with a single tab', () => {
    expect(neighbourCanvasTabId(tabs(['t1', 'root']), 't1', 1)).toBeNull()
  })
})

describe('reorderCanvasTabs', () => {
  it('drops the source where the target sits', () => {
    expect(reorderCanvasTabs(tabs(['t1', 'root'], ['t2', 'alpha'], ['t3', 'beta']), 't3', 't1')).toEqual(
      tabs(['t3', 'beta'], ['t1', 'root'], ['t2', 'alpha']),
    )
  })

  it('drops the source where the target sits when dragging rightward too', () => {
    const row = tabs(['t1', 'root'], ['t2', 'alpha'], ['t3', 'beta'])
    // Inserting BEFORE the target made this a no-op, so a neighbour swap
    // looked broken and the last slot could not be reached at all.
    expect(reorderCanvasTabs(row, 't1', 't2')).toEqual(
      tabs(['t2', 'alpha'], ['t1', 'root'], ['t3', 'beta']),
    )
    expect(reorderCanvasTabs(row, 't1', 't3')).toEqual(
      tabs(['t2', 'alpha'], ['t3', 'beta'], ['t1', 'root']),
    )
  })

  it('is a no-op for unknown or self targets', () => {
    const row = tabs(['t1', 'root'], ['t2', 'alpha'])
    expect(reorderCanvasTabs(row, 't1', 't1')).toEqual(row)
    expect(reorderCanvasTabs(row, 't1', 'nope')).toEqual(row)
  })
})
