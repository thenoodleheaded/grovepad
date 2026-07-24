/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sketchpad = readFileSync(new URL('./modules/SketchpadWidget.tsx', import.meta.url), 'utf8')
const modeDock = readFileSync(new URL('../ui/CanvasModeDock.tsx', import.meta.url), 'utf8')

describe('Sketchpad interaction contracts', () => {
  it('batches paint, handles empty coalesced batches, and simplifies before persistence', () => {
    expect(sketchpad).toContain('requestAnimationFrame(paint)')
    expect(sketchpad).toContain('getCoalescedEvents?.() ?? []')
    expect(sketchpad).toContain('coalesced.length > 0 ? coalesced : [event.nativeEvent]')
    expect(sketchpad).toContain('simplifySketchPoints(stroke.points')
  })

  it('rejects touch palms so fingers stay reserved for navigation', () => {
    expect(sketchpad).toContain("if (event.pointerType === 'touch') {")
    expect(sketchpad).toContain('data-widget-interactive="true"')
    expect(modeDock).not.toContain("mode: 'draw' as const")
    expect(modeDock).not.toContain("shortcut: 'P'")
  })
})
