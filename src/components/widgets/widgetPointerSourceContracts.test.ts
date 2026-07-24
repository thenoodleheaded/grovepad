/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const policy = readFileSync(new URL('../../utils/widgetPointerPolicy.ts', import.meta.url), 'utf8')
const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const magnetic = readFileSync(new URL('./useWidgetMagneticHover.ts', import.meta.url), 'utf8')

/**
 * These guard a bug class the suite cannot reach without a DOM: a press that
 * lands on a control but is arbitrated as bare card surface. The card then
 * starts a drag, captures the pointer, and the control's click never fires.
 */
describe('widget pointer arbitration source contracts', () => {
  it('tests interactive targets against Element, never only HTMLElement', () => {
    // An icon button's hit area is its <svg> glyph, and SVGElement does not
    // extend HTMLElement — narrowing here silently breaks every icon control.
    expect(policy).toContain('export function isInteractiveWidgetTarget')
    expect(policy).toContain('if (!(target instanceof Element)) return false')
    expect(policy).not.toMatch(
      /isInteractiveWidgetTarget[\s\S]{0,200}!\(target instanceof HTMLElement\)\) return false/,
    )
  })

  it('matches controls anywhere in the pressed subtree, not just the exact node', () => {
    expect(policy).toContain('button, input, textarea, select, [contenteditable="true"], [data-widget-interactive="true"]')
    expect(policy).toContain('target.closest(INTERACTIVE_SELECTOR) !== null')
  })

  it('routes the card through the shared arbiter instead of a private copy', () => {
    expect(card).toContain('isInteractiveWidgetTarget')
    expect(card).not.toMatch(/function isInteractiveTarget\(target: EventTarget \| null\): boolean \{/)
  })

  it('pins the magnetic offset on press so a control cannot slide out from under it', () => {
    expect(magnetic).toContain('const freeze = useCallback(')
    expect(card).toContain('onPointerDownCapture={() => magneticHover.freeze()}')
  })
})
