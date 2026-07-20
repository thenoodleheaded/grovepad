import { describe, expect, it } from 'vitest'
import { isMinimapExpanded } from './adaptiveChrome'

describe('adaptive canvas chrome', () => {
  it('starts compact on a phone without changing the desktop preference', () => {
    expect(isMinimapExpanded('phone', false, false)).toBe(false)
    expect(isMinimapExpanded('phone', true, false)).toBe(false)
  })

  it('lets a phone expand its map for the current visit', () => {
    expect(isMinimapExpanded('phone', true, true)).toBe(true)
  })

  it('honors the persisted preference on tablet and desktop', () => {
    expect(isMinimapExpanded('tablet', false, false)).toBe(true)
    expect(isMinimapExpanded('desktop', true, true)).toBe(false)
  })
})
