/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const ports = readFileSync(new URL('./PortRail.tsx', import.meta.url), 'utf8')
const focus = readFileSync(new URL('./FocusModeLayer.tsx', import.meta.url), 'utf8')

describe('shared widget accessibility source contracts', () => {
  it('hides dormant full-state chrome and content in compact states', () => {
    expect(card).toContain('inert={collapsed || iconified ? true : undefined}')
    expect(card).toContain('aria-hidden={collapsed || iconified || undefined}')
    expect(card).toContain("!groupId && !collapsed && !iconified")
  })

  it('keeps Focus background cards inert and provides keyboard panel movement', () => {
    expect(card).toContain('inert={isFocusBackground ? true : undefined}')
    expect(focus).toContain('tabIndex={island.reorderable ? 0 : undefined}')
    expect(focus).toContain('reorderWithKeyboard(island, -1)')
    expect(focus).toContain('reorderWithKeyboard(island, 1)')
    expect(focus).toContain('aria-live="polite"')
  })

  it('exposes named Circuit buttons and keyboard start, target, and cancel paths', () => {
    expect(ports).not.toContain('aria-hidden\n      data-expanded')
    expect(ports).not.toContain('tabIndex={-1}')
    expect(ports).toContain('Start connection from ${port.label} output')
    expect(ports).toContain('Connect to ${port.label}')
    expect(ports).toContain("event.key === 'Escape'")
  })
})
