import { describe, expect, it } from 'vitest'
import { pointerStayedWithinTapSlop } from './pointerTap'

describe('pointer tap slop', () => {
  it('absorbs normal finger jitter but hands deliberate movement to dragging', () => {
    const start = { clientX: 100, clientY: 100 }
    expect(pointerStayedWithinTapSlop(start, { clientX: 102, clientY: 102 })).toBe(true)
    expect(pointerStayedWithinTapSlop(start, { clientX: 104, clientY: 100 })).toBe(false)
    expect(pointerStayedWithinTapSlop(start, { clientX: 112, clientY: 108 })).toBe(false)
  })
})
