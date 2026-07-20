import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  widgetActiveButtonCount,
  widgetHasButtonOverflow,
  widgetTitleAreaWidth,
} from './widgetButtonLayout'

function widget(overrides: Partial<Widget> = {}): Pick<Widget, 'type' | 'metadata' | 'title' | 'size'> {
  return {
    type: 'notes',
    title: 'Notes',
    size: { width: 280, height: 160 },
    metadata: { badges: [] },
    ...overrides,
  }
}

describe('widgetActiveButtonCount', () => {
  it('defaults to favorite + focus + delete active, others off', () => {
    expect(widgetActiveButtonCount(widget())).toBe(3)
  })

  it('checklist widgets get the completed checkbox for free', () => {
    expect(widgetActiveButtonCount(widget({ type: 'checklist' }))).toBe(4)
  })

  it('locked widgets show the pin even without an explicit toggle', () => {
    expect(widgetActiveButtonCount(widget({ metadata: { badges: [], locked: true } }))).toBe(4)
  })

  it('explicit show* toggles add buttons; showFavoriteButton: false removes the default one', () => {
    expect(
      widgetActiveButtonCount(
        widget({ metadata: { badges: [], showFavoriteButton: false, showDuplicateButton: true, showMarkdownButton: true } }),
      ),
    ).toBe(4) // focus, delete, duplicate, markdown — favorite dropped
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
    expect(widgetHasButtonOverflow(widget(), false)).toBe(false)
  })

  it('overflows a narrow card with the same default buttons', () => {
    expect(widgetHasButtonOverflow(widget({ size: { width: 160, height: 160 } }), false)).toBe(true)
  })

  it('the group detach button can push a borderline card into overflow', () => {
    const w = widget({ size: { width: 280, height: 160 } })
    expect(widgetHasButtonOverflow(w, false)).toBe(false)
    expect(widgetHasButtonOverflow(w, true)).toBe(true)
  })

  it('a long title shrinks available room enough to force overflow', () => {
    expect(widgetHasButtonOverflow(widget({ title: 'A considerably longer widget title' }), false)).toBe(true)
  })
})
