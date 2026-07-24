/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const ports = readFileSync(new URL('./PortRail.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

describe('shared widget accessibility source contracts', () => {
  it('hides dormant full-state chrome and content in compact states', () => {
    expect(card).toContain('inert={iconified ? true : undefined}')
    expect(card).toContain('aria-hidden={iconified || undefined}')
    // The resize affordance is the card's own outline, painted by an inert
    // overlay the pointer passes straight through — there is no separate grip
    // element to leave in the tab order or announce to a screen reader.
    expect(card).toContain('<span aria-hidden className="gp-resize-edge pointer-events-none')
    expect(card).not.toContain('gp-widget-resize-target')
  })

  it('gives a scaled icon state a title, since its name capsule is hidden', () => {
    expect(card).toContain('title={iconified || restIcon ? widget.title : undefined}')
  })

  it('exposes named Circuit buttons and keyboard start, target, and cancel paths', () => {
    expect(ports).not.toContain('aria-hidden\n      data-expanded')
    expect(ports).not.toContain('tabIndex={-1}')
    expect(ports).toContain('Start connection from ${port.label} output')
    expect(ports).toContain('Connect to ${port.label}')
    expect(ports).toContain("event.key === 'Escape'")
  })

  it('keeps Circuit ports mode-gated and reveals their labels outward on widget hover', () => {
    expect(ports).toContain('if (!widget || !circuitMode) return null')
    expect(styles).toContain('.gp-widget-card:hover .gp-port-label')
    expect(styles).toMatch(/\.gp-port-label-out\s*\{[^}]*left: 14px;[^}]*text-align: left;/s)
    expect(styles).toMatch(/\.gp-port-label-in\s*\{[^}]*right: 14px;[^}]*text-align: right;/s)
    expect(styles).not.toContain('body[data-circuit-mode] .gp-port-label')
  })
})
