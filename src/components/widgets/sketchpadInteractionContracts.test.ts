/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sketchpad = readFileSync(new URL('./modules/SketchpadWidget.tsx', import.meta.url), 'utf8')
const modeDock = readFileSync(new URL('../ui/CanvasModeDock.tsx', import.meta.url), 'utf8')
const widgetCard = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')

describe('Sketchpad interaction contracts', () => {
  it('batches paint, handles empty coalesced batches, and simplifies before persistence', () => {
    expect(sketchpad).toContain('requestAnimationFrame(paint)')
    expect(sketchpad).toContain('getCoalescedEvents?.() ?? []')
    expect(sketchpad).toContain('coalesced.length > 0 ? coalesced : [event.nativeEvent]')
    expect(sketchpad).toContain('simplifySketchPoints(stroke.points')
  })

  it('rejects touch palms and exposes drawing only while the Sketchpad is focused', () => {
    expect(sketchpad).toContain("state.focusedWidgetId === widgetId")
    expect(sketchpad).toContain("event.pointerType === 'touch' && drawingEnabled")
    expect(sketchpad).toContain('data-widget-interactive="true"')
    expect(modeDock).not.toContain("mode: 'draw' as const")
    expect(modeDock).not.toContain("shortcut: 'P'")
  })

  it('keeps Pencil text entry available to operating-system Scribble', () => {
    expect(widgetCard).toContain('isTextEntryTarget: isTextEntryTarget(target)')
    expect(widgetCard).toContain('target.closest(\'[contenteditable="true"]\')')
  })
})
