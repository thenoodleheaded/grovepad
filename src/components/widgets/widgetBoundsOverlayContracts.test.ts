/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A card's box glides between sizes while the numbers a renderer draws from
// jump straight to the destination, so any overlay sized in pixels escapes the
// card's outline for the length of the glide. These are source contracts
// rather than render assertions because the failure only exists mid-transition
// in a real browser; what can be pinned deterministically is that no overlay
// states a pixel size in the first place.

const overlay = readFileSync(new URL('./WidgetBoundsOverlay.tsx', import.meta.url), 'utf8')
const ring = readFileSync(new URL('./WidgetClockRing.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

describe('widget bounds overlay contract', () => {
  it('exists because the card box is animated, not instant', () => {
    // The premise: if this transition ever goes away the overlay is still
    // correct, but the bug it prevents came from here.
    expect(css).toContain('.gp-widget-layout-motion {')
    expect(css).toMatch(/\.gp-widget-layout-motion \{[^}]*width var\(--gp-motion-layout\)/)
    expect(css).toMatch(/\.gp-widget-layout-motion \{[^}]*height var\(--gp-motion-layout\)/)
  })

  it('fills the painted box instead of declaring a pixel size', () => {
    expect(overlay).toContain('viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}')
    expect(overlay).toContain('preserveAspectRatio="none"')
    expect(overlay).toContain('absolute inset-0 h-full w-full')
    // A width/height prop on the <svg> is exactly the defect: it would pin the
    // overlay to the destination box while the card is still mid-glide.
    expect(overlay).not.toMatch(/<svg[\s\S]*?\swidth=/)
    expect(overlay).not.toMatch(/<svg[\s\S]*?\sheight=/)
    // The size props may only reach the viewBox, never the element.
    expect(overlay).toContain("'width' | 'height' | 'viewBox' | 'preserveAspectRatio'")
  })

  it('is what the clock bezel paints through', () => {
    expect(ring).toContain('<WidgetBoundsOverlay')
    expect(ring).not.toContain('<svg')
  })
})
