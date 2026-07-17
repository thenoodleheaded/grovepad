import { describe, expect, it } from 'vitest'
import { menuNavigationIndex } from '../../utils/menuNavigation'

describe('widget context menu semantics', () => {
  it('wraps arrow navigation and supports Home and End', () => {
    expect(menuNavigationIndex(0, 3, 'ArrowUp')).toBe(2)
    expect(menuNavigationIndex(2, 3, 'ArrowDown')).toBe(0)
    expect(menuNavigationIndex(1, 3, 'Home')).toBe(0)
    expect(menuNavigationIndex(1, 3, 'End')).toBe(2)
  })
})
