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
    expect(css).toContain('--gp-widget-muted-text: #a3a3a3')
    expect(css).toContain('--gp-widget-muted-text: #525252')
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
