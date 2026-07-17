/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

describe('global typography contract', () => {
  it('loads every used Clash Display weight directly from Fontshare', () => {
    expect(css).not.toContain('api.fontshare.com')
    expect(css.match(/font-family: 'Clash Display'/g)).toHaveLength(5)
    expect(css.match(/cdn\.fontshare\.com/g)).toHaveLength(5)

    for (const weight of [300, 400, 500, 600, 700]) {
      expect(css).toContain(`font-weight: ${weight}`)
    }
  })

  it('uses Clash Display for the global sans token and preconnects its CDN', () => {
    expect(css).toContain("--font-sans: 'Clash Display'")
    expect(css).toContain('font-family: var(--font-sans)')
    expect(html).toContain('rel="preconnect" href="https://cdn.fontshare.com" crossorigin')
  })
})
