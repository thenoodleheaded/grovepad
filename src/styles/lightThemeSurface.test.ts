/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(new URL('./product/01-tokens-base.css', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./product/02-canvas-toolbar.css', import.meta.url), 'utf8')
const controls = readFileSync(new URL('./product/04-controls.css', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('light-theme surface ladder', () => {
  it('keeps the light canvas a neutral paper while lowering raised UI surfaces', () => {
    // The regression this pins: the light canvas was a pale sage that also let
    // a share of the workspace accent bleed through, so the board read as
    // tinted rather than as paper. Nothing here may carry a hue. The canvas
    // colour is stated in two places — here and DEFAULT_CANVAS_COLORS.light in
    // components/canvas/auraTuning.ts — and both must move together.
    expect(tokens).toContain('--gp-surface-canvas: #f4f5f6')
    expect(tokens).toContain('--gp-canvas-tint-base: #f4f5f6')
    expect(tokens).toContain('--gp-grid-fine: rgb(112 116 122 / calc(0.18 * var(--gp-tune-grid, 1)))')
    expect(tokens).toContain('--gp-surface-panel: oklch(96% 0.022 140 / 0.97)')
    expect(tokens).toContain('oklch(95.5% 0.024 140 / 0.985)')
    expect(toolbar).toContain('--gp-surface-control: oklch(90% 0.011 140 / 0.9)')
    expect(toolbar).toContain('--gp-surface-menu: oklch(96.8% 0.004 140 / 0.99)')
    expect(globalCss).toContain('--color-neutral-950: oklch(96.5% 0.02 142)')
  })

  it('denies the workspace accent any share of the light canvas', () => {
    // Strength is the BASE colour's own share of the mix, so 100% means the
    // accent contributes nothing and switching workspaces cannot re-tint the
    // paper. Dark still takes its 3% against near-black.
    expect(tokens).toContain('--gp-canvas-tint-strength: 97%')
    expect(tokens).toContain('--gp-canvas-tint-strength: 100%')
  })

  it('leaves no coloured wash painted over the light canvas shell', () => {
    // The shell's own gradients were a second, independent tint source: with
    // the tokens neutral the board still read green because a 145-hue wash sat
    // on top of them. Depth belongs to the cards, not the page.
    const lightShell = toolbar.slice(toolbar.indexOf("[data-theme='light'] .gp-canvas-shell"))
    const rule = lightShell.slice(0, lightShell.indexOf('}'))
    expect(rule).toContain('background: var(--gp-surface-canvas)')
    expect(rule).not.toContain('radial-gradient')
  })

  it('keeps the accent glow alive on light-theme cards', () => {
    // `[data-theme='light'] .gp-backplate` is 0-2-0 and this file loads after
    // index.css, so it tied-and-beat index.css's equally-weighted selected /
    // link-source / rest-expanded glow rules and light theme lost every glow
    // while dark kept them. The extra `.gp-widget-card` is what wins the tie —
    // dropping it silently removes the glow again with no test failure unless
    // this stays pinned.
    for (const state of ['data-selected', 'data-link-source', 'data-rest-expanded']) {
      expect(controls).toContain(`[data-theme='light'] .gp-widget-card.gp-backplate[${state}=`)
    }
    // A resting card is lit too, not just a flat rectangle on the paper.
    expect(controls).toContain('0 0 22px color-mix(in oklab, var(--gp-widget-accent, #84cc16), transparent 88%)')
  })

  it('uses the same slightly deeper silver sweep for every widget backplate', () => {
    // index.css is deliberately absent: its `.gp-widget-card.gp-glass` copy of
    // this sweep was fully shadowed by `.gp-backplate.gp-glass` in 04-controls
    // (equal specificity, product.css loads later), so it painted nothing and
    // had already drifted from the live values. Pinning a copy that never
    // renders is what let the two versions disagree unnoticed.
    for (const css of [tokens, controls]) {
      expect(css).toContain('oklch(92%')
      expect(css).toContain('oklch(86.5%')
      expect(css).toContain('oklch(91.5%')
      expect(css).toContain('oklch(82.5%')
    }
  })
})
