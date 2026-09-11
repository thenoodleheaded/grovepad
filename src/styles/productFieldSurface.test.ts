/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cssDir = new URL('./product/', import.meta.url)
const css = readdirSync(cssDir)
  .sort()
  .map((file) => readFileSync(new URL(file, cssDir), 'utf8'))
  .join('\n')

describe('shared text-field surface contract', () => {
  it('enforces readable widget microcopy contrast in both themes', () => {
    // Dark cards keep light muted ink; light-theme silver cards switch to a
    // darker muted ink while explicit display wells restore the dark palette.
    expect(css).toContain('--gp-widget-muted-text: #59645d')
    expect(css).toContain('--gp-widget-ink: #222a25')
    expect(css).toContain(".gp-widget-ui :where(.gp-well, .gp-display-well)")
    expect(css).toContain('--gp-widget-muted-text: #a3a3a3')
    expect(css).toContain('.gp-widget-card :where(.text-neutral-600, .text-neutral-700)')
  })
  it('keeps text controls visually transparent and borderless', () => {
    const controls = css.slice(
      css.indexOf('/* Text controls are only the editable contents'),
      css.indexOf('/* A full text field is one island'),
    )

    expect(controls).toContain('border: 0 !important;')
    expect(controls).toContain('background: transparent !important;')
    expect(controls).toContain('box-shadow: none !important;')
  })

  it('keeps the visible outline on the containing island without a focus highlight', () => {
    expect(css).not.toContain('.gp-field-island:focus-within')
    expect(css).toContain('):has(> :where(')
    expect(css).toContain('outline: 1px solid rgb(255 255 255 / .10)')
  })

  it('paints every island from ONE material, in both themes', () => {
    // Three hand-written fills used to coexist: the island's own (white 10% →
    // 5%), the field island's (8% → 3.5%), and the promoted legacy wrapper's
    // copy of the latter — so two content groups at the same elevation inside
    // one card read as two different materials. The recipe is tokens now, and
    // the light theme re-points those tokens instead of re-declaring rules,
    // which is how the promoted field islands used to get left behind on the
    // dark recipe.
    expect(css).toContain('--gp-island-fill:')
    expect(css).toContain('--gp-island-catchlight:')
    expect(css).toContain('--gp-island-contact:')
    // The bottom stop is always half the top, so the gradient keeps its shape
    // at any Fine-tune setting rather than flattening as the slider rises.
    expect(css).toContain('--gp-island-lift: calc(var(--gp-tune-island-light, 16) / 100)')
    expect(css).toContain('calc(var(--gp-island-lift) * 0.5)')
    // No island anywhere hand-rolls a white gradient of its own any more.
    expect(css).not.toContain('linear-gradient(180deg, rgb(255 255 255 / .08), rgb(255 255 255 / .035))')
    expect(css).not.toContain('rgb(255 255 255 / calc(var(--gp-tune-island-light, 10) / 100))')
    // The light theme owns the material through the tokens, not a second rule.
    expect(css).not.toContain("[data-theme='light'] .gp-island,")
  })

  it('promotes the closest legacy field wrapper and flattens it inside an existing island', () => {
    expect(css).toContain('.gp-widget-ui :where(div, section, article, li, fieldset, label, td):has(> :where(')
    expect(css).toContain('.gp-widget-ui :where(.gp-island, [data-island], .gp-subpanel, .gp-subdivision)')
    expect(css).toContain('background: transparent;')
  })

  it('keeps compound rows and icon/text buttons from manufacturing nested islands', () => {
    expect(css).toContain(':has(> button):has(> :where(')
    expect(css).toContain(':has(> button:only-child)')
    expect(css).toContain("button:not(.gp-check-free):not([role='checkbox']):not(:empty)")
    expect(css).toContain('background-color: transparent !important;')
    expect(css).toContain('box-shadow: none !important;')
  })

  it('retains the shared inset when legacy rows become nested wells', () => {
    expect(css).toContain('padding-inline: var(--gp-p1);')
  })
})
