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
  it('defaults to favorite + delete active, others off', () => {
    expect(widgetActiveButtonCount(widget())).toBe(2)
  })

  it('checklist widgets get the completed checkbox for free', () => {
    expect(widgetActiveButtonCount(widget({ type: 'checklist' }))).toBe(3)
  })

  it('no longer reserves a title-row slot for pinning', () => {
    // Pinning moved out of the customize row to a floating pill above the
    // expanded card, so neither an explicit toggle nor a locked state adds a
    // pin button to the row count.
    expect(widgetActiveButtonCount(widget({ metadata: { badges: [], locked: true } }))).toBe(2)
  })

  it('explicit show* toggles add buttons; showFavoriteButton: false removes the default one', () => {
    expect(
      widgetActiveButtonCount(
        widget({ metadata: { badges: [], showFavoriteButton: false, showDuplicateButton: true, showMarkdownButton: true } }),
      ),
    ).toBe(3) // delete, duplicate, markdown — favorite dropped
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
  it('fits the default 2 buttons + plus in a normal-width card', () => {
    // width 280: titleArea 87 -> 193 available -> 4 horizontal slots; 2 buttons + plus = 3 items.
    expect(widgetHasButtonOverflow(widget())).toBe(false)
  })

  it('overflows a narrow card with the same default buttons', () => {
    expect(widgetHasButtonOverflow(widget({ size: { width: 160, height: 160 } }))).toBe(true)
  })

  it('a long title shrinks available room enough to force overflow', () => {
    expect(widgetHasButtonOverflow(widget({ title: 'A considerably longer widget title' }))).toBe(true)
  })
})
