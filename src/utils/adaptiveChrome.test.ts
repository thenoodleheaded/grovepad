import { describe, expect, it } from 'vitest'
import {
  isMinimapExpanded,
  modeDockShowsHistory,
  offersSelectMore,
  usesTouchCanvasChrome,
} from './adaptiveChrome'

describe('adaptive canvas chrome', () => {
  it('starts compact on a phone without changing the desktop preference', () => {
    expect(isMinimapExpanded('phone', false, false)).toBe(false)
    expect(isMinimapExpanded('phone', true, false)).toBe(false)
  })

  it('lets a phone expand its map for the current visit', () => {
    expect(isMinimapExpanded('phone', true, true)).toBe(true)
  })

  it('treats short landscape viewports as compact even at tablet width', () => {
    expect(isMinimapExpanded('tablet', false, false, true)).toBe(false)
    expect(isMinimapExpanded('tablet', true, true, true)).toBe(true)
  })

  it('honors the persisted preference on tablet and desktop', () => {
    expect(isMinimapExpanded('tablet', false, false)).toBe(true)
    expect(isMinimapExpanded('desktop', true, true)).toBe(false)
  })

  it('wears touch chrome on every phone and tablet, and on desktop only under a finger or Pencil', () => {
    expect(usesTouchCanvasChrome('phone', 'mouse')).toBe(true)
    expect(usesTouchCanvasChrome('tablet', 'keyboard')).toBe(true)
    expect(usesTouchCanvasChrome('desktop', 'mouse')).toBe(false)
    expect(usesTouchCanvasChrome('desktop', 'keyboard')).toBe(false)
    expect(usesTouchCanvasChrome('desktop', 'touch')).toBe(true)
    expect(usesTouchCanvasChrome('desktop', 'pen')).toBe(true)
  })

  it('puts Undo and Redo in the dock only where the zoom row has dropped them', () => {
    expect(modeDockShowsHistory('phone')).toBe(true)
    expect(modeDockShowsHistory('tablet')).toBe(true)
    expect(modeDockShowsHistory('desktop')).toBe(false)
  })

  it('offers Select more to touch chrome in Navigate mode only', () => {
    expect(offersSelectMore(true, 'navigate')).toBe(true)
    expect(offersSelectMore(true, 'select')).toBe(false)
    expect(offersSelectMore(true, 'connect')).toBe(false)
    expect(offersSelectMore(false, 'navigate')).toBe(false)
  })
})
