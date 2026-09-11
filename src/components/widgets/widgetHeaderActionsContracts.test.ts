/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')

describe('expanded widget header actions', () => {
  it('requests deletion with a collection containing the whole widget id', () => {
    // A string is technically iterable, but iterating it yields characters.
    // The deletion owner expects complete widget ids.
    expect(card).toContain('requestWidgetDeletion([widgetId])')
    expect(card).not.toContain('requestWidgetDeletion(widgetId)')
  })

  it('keeps Pin on ordinary widgets but removes it from every Canvas skin', () => {
    expect(card).toMatch(/\{\s*id:\s*['"]pin['"]/)
    expect(card).toContain("case 'pin':")
    expect(card).toContain("return widget.type !== 'canvas_node'")
  })

  it('offers Full screen on every card, opening the shared sheet presentation', () => {
    // The expand button reuses the phone sheet (one fullscreen presentation,
    // not a second implementation), and captures the card's live on-screen
    // rectangle so the sheet grows out of the card it came from.
    expect(card).toMatch(/\{\s*id:\s*['"]expand['"]/)
    expect(card).toContain("case 'expand':")
    expect(card).toContain('openWidgetSheet(widgetId, widgetSheetOrigin(widgetId))')
  })
})
