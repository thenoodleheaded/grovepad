/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// An expand or a collapse runs on two clocks at once: the CSS transition that
// glides the card's box, and the JS timers that keep the outgoing content, the
// blur halo and the stacking lift alive long enough to cover it. Both of those
// failures only exist mid-transition in a real browser, so what gets pinned
// here is the source-level property that makes them impossible: there is one
// clock, read from the element, and the halo never rides the animating box.

const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const rest = readFileSync(new URL('../../utils/widgetRest.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

describe('expand/collapse hold windows', () => {
  it('measures the glide off the element instead of restating it', () => {
    // `--gp-motion-layout` is a live Fine-tune slider (80–800ms) and reduced
    // motion flattens it to nothing, so a hold written as a constant is only
    // ever correct at the stock setting.
    expect(rest).toContain('export function restGlideMs(')
    expect(rest).toContain('transitionDuration')
    expect(card).toContain('restGlideMs(layoutRef.current)')
    // The constant survives as the fallback, but nothing may schedule against
    // it: that is exactly the drift this contract exists to stop.
    expect(card).not.toContain('REST_TRANSITION_MS')
  })

  it('covers the outgoing content, the halo and the stacking lift alike', () => {
    // All three have to outlive the same glide. If any one of them expires
    // early the collapse tears: content pops out of a card that is still
    // closing, the halo blinks out at full strength, or the lift drops a
    // half-collapsed card behind the widgets it is still covering.
    expect(card).toContain('holdContent(true, restGlideMs(layoutRef.current))')
    expect(card).toContain('const glide = restGlideMs(layoutRef.current)')
    expect(card).toContain('if (!restExpanded) holdHalo(true, glide)')
    expect(card).toContain('holdGlide(true, glide)')
    expect(card).toContain('restExpanded || haloLingering ? Math.max(320, restLiftZ)')
  })
})

describe('expand/collapse frame cost', () => {
  it('holds the halo box still instead of resizing a backdrop filter', () => {
    const halo = ruleBody('.gp-rest-halo')
    // Sized from the card's expanded box and centred on a point that does not
    // move (expansion is centre-anchored), so the blur is sampled once for the
    // whole gesture rather than re-taken every frame.
    expect(halo).toContain('var(--gp-halo-w, 0px)')
    expect(halo).toContain('var(--gp-halo-h, 0px)')
    expect(halo).toContain('translate: -50% -50%')
    expect(halo).toContain('will-change: opacity')
    // Insetting off the wrapper is the defect: the wrapper is the thing being
    // animated, so the filtered region would resize on every frame.
    expect(halo).not.toContain('inset:')
    expect(card).toContain("'--gp-halo-w': `${widget.size.width}px`")
    expect(card).toContain("'--gp-halo-h': `${widget.size.height}px`")
  })

  it('promotes the gliding card for the length of the glide only', () => {
    expect(css).toContain('.gp-widget-layout-motion[data-rest-motion] {')
    expect(ruleBody('.gp-widget-layout-motion[data-rest-motion]')).toContain('will-change')
    expect(card).toContain('data-rest-motion={restGliding || undefined}')
    // A promotion every card carries all the time is a memory cost for
    // movement that is not happening.
    expect(ruleBody('.gp-widget-layout-motion')).not.toContain('will-change')
  })
})
