/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const productDirectory = new URL('./product/', import.meta.url)
const sheets = readdirSync(productDirectory)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => ({ name, source: readFileSync(new URL(name, productDirectory), 'utf8') }))

const declared = new Set(
  sheets.flatMap(({ source }) => [...source.matchAll(/(--gp-duration-[\w-]+)\s*:/g)].map((m) => m[1]!)),
)

describe('motion duration tokens', () => {
  it('declares every duration token the skins reference without a fallback', () => {
    // A `var(--gp-duration-x)` with no fallback and no declaration is invalid
    // at computed-value time, which throws away the WHOLE transition shorthand
    // it sits in — the animation is silently off, and so is every other
    // property listed beside it. `--gp-duration-glide` and
    // `--gp-duration-smooth` were in that state across six declarations.
    const missing: string[] = []
    for (const { name, source } of sheets) {
      for (const match of source.matchAll(/var\(\s*(--gp-duration-[\w-]+)\s*\)/g)) {
        if (!declared.has(match[1]!)) missing.push(`${name}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps the duration ladder ordered from instant to glide', () => {
    const tokens = sheets.find((sheet) => sheet.name === '01-tokens-base.css')!.source
    expect(tokens).toContain('--gp-duration-instant: 90ms;')
    expect(tokens).toContain('--gp-duration-snap: var(--gp-tune-snap, 150ms);')
    expect(tokens).toContain('--gp-duration-glide: 260ms;')
    expect(tokens).toContain('--gp-duration-smooth: 260ms;')
  })
})
