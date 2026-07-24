import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { makeWidget } from '../test/factories'
import {
  widgetActiveButtonCount,
  widgetHasButtonOverflow,
  widgetTitleAreaWidth,
} from './widgetButtonLayout'

function widget(overrides: Partial<Widget> = {}): Pick<Widget, 'type' | 'metadata' | 'title' | 'size'> {
  return makeWidget({
    title: 'Notes',
    size: { width: 280, height: 160 },
    ...overrides,
  })
}

describe('widgetActiveButtonCount', () => {
  it('is the static set: pin + favorite + delete on every card', () => {
    // The customize menu is gone — the row is fixed, and metadata cannot add
    // or remove buttons.
    expect(widgetActiveButtonCount(widget())).toBe(3)
    expect(widgetActiveButtonCount(widget({ metadata: { badges: [], pinned: true } }))).toBe(3)
  })

  it('checklist widgets get the completed checkbox for free', () => {
    expect(widgetActiveButtonCount(widget({ type: 'checklist' }))).toBe(4)
  })
})

describe('widgetTitleAreaWidth', () => {
  it('grows with title length up to the 200px cap', () => {
    expect(widgetTitleAreaWidth('')).toBe(52)
    expect(widgetTitleAreaWidth('Notes')).toBe(87)
    expect(widgetTitleAreaWidth('a'.repeat(50))).toBe(252) // 200 (capped) + 52
  })
})

describe('widgetHasButtonOverflow', () => {
  it('fits the default 3 buttons + plus in a normal-width card', () => {
    // width 280: titleArea 87 -> 193 available -> 4 horizontal slots; 3 buttons + plus = 4 items.
    expect(widgetHasButtonOverflow(widget())).toBe(false)
  })

  it('overflows a narrow card with the same default buttons', () => {
    expect(widgetHasButtonOverflow(widget({ size: { width: 160, height: 160 } }))).toBe(true)
  })

  it('a long title shrinks available room enough to force overflow', () => {
    expect(widgetHasButtonOverflow(widget({ title: 'A considerably longer widget title' }))).toBe(true)
  })
})
