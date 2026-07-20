/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hook = readFileSync(new URL('./useWidgetMagneticHover.ts', import.meta.url), 'utf8')
const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

describe('widget magnetic hover contract', () => {
  it('tracks a hovering fine mouse or Pencil without React or store updates', () => {
    expect(hook).toContain("sample.pointerType === 'mouse' || sample.pointerType === 'pen'")
    expect(hook).toContain('sample.buttons === 0')
    expect(hook).toContain('sample.pressure <= 0.01')
    expect(hook).toContain("matchMedia('(any-hover: hover) and (any-pointer: fine)')")
    expect(hook).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    expect(hook).not.toContain('useState')
    expect(hook).not.toContain('useWidgetStore')
  })

  it('uses one bounded animation frame loop and releases its GPU hint', () => {
    expect(hook).toContain('requestAnimationFrame(step)')
    expect(hook).toContain("card.removeAttribute('data-magnetic-active')")
    expect(hook).toContain("layout?.removeAttribute('data-magnetic-hover')")
    expect(css).toContain('.gp-card-motion[data-magnetic-active="true"]')
    expect(css).toContain('will-change: translate, scale')
  })

  it('layers the effect onto the existing widget pointer handlers', () => {
    expect(card).toContain('magneticHover.enter(event)')
    expect(card).toContain('magneticHover.move(e)')
    expect(card).toContain('magneticHover.leave()')
    expect(card).toContain('magneticHover.suspend()')
  })

  it('holds the visual offset through pointer-down and releases it after drag', () => {
    expect(hook).toContain('const beginDrag = () =>')
    expect(hook).toContain("layout.setAttribute('data-magnetic-drag', 'true')")
    expect(hook).toContain("layoutRef.current?.removeAttribute('data-magnetic-drag')")
    expect(hook).toContain('Preserve currentX/currentY exactly')
    expect(hook).toContain('if (disabled || !state.hovered)')
    expect(card).toContain('magneticHover.beginDrag()')
    expect(card).toContain('magneticHover.endDrag(e)')
    expect(card).toContain("if (isLink) {\n      magneticHover.suspend()")
    expect(css).toContain('.gp-widget-layout-motion[data-magnetic-drag="true"]')
  })
})
