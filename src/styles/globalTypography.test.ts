/// <reference types="node" />

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

function applicationSources(directory: URL): Array<{ file: string; source: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return applicationSources(url)
    if (!/\.(css|ts|tsx)$/.test(entry.name) || entry.name.includes('.test.')) return []
    return [{ file: url.pathname, source: readFileSync(url, 'utf8') }]
  })
}

describe('global typography contract', () => {
  it('serves every used Clash Display weight from the bundle, never the network', () => {
    // The app claims to work offline, so no face may be fetched at runtime.
    expect(css).not.toContain('fontshare.com')
    expect(css.match(/font-family: 'Clash Display'/g)).toHaveLength(5)
    expect(css.match(/url\('\/fonts\/clash-display-\d{3}\.woff2'\)/g)).toHaveLength(5)
    // A late face would reflow every label a beat after launch.
    expect(css).not.toContain('font-display: swap')

    for (const weight of [300, 400, 500, 600, 700]) {
      expect(css).toContain(`font-weight: ${weight}`)
      // Each filename carries the weight it actually holds.
      expect(css).toContain(`url('/fonts/clash-display-${weight}.woff2')`)
      expect(existsSync(new URL(`../../public/fonts/clash-display-${weight}.woff2`, import.meta.url)))
        .toBe(true)
    }
  })

  it('uses Clash Display for the global sans token and preconnects nothing', () => {
    expect(css).toContain("--font-sans: 'Clash Display'")
    expect(css).toContain('font-family: var(--font-sans)')
    expect(css).toContain(':where(input, textarea, select, button, code, kbd, samp, pre, svg text)')
    expect(css).not.toContain('ui-monospace')
    expect(html).not.toContain('fontshare.com')
  })

  it('contains no alternate application or widget font family', () => {
    const forbidden = [
      ['font', 'mono'].join('-'),
      ['font', 'serif'].join('-'),
      ['ui', 'monospace'].join('-'),
      ['ui', 'serif'].join('-'),
      ['ui', 'sans-serif'].join('-'),
      ['system', 'ui'].join('-'),
    ]
    const offenders = applicationSources(new URL('../', import.meta.url)).flatMap(({ file, source }) =>
      forbidden.some((token) => source.includes(token)) ? [file] : [],
    )
    expect(offenders).toEqual([])
  })
})
