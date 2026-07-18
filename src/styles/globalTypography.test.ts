/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs'
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
    expect(css).toContain(':where(input, textarea, select, button, code, kbd, samp, pre, svg text)')
    expect(css).not.toContain('ui-monospace')
    expect(html).toContain('rel="preconnect" href="https://cdn.fontshare.com" crossorigin')
  })

  it('contains no alternate application or widget font family', () => {
    const forbidden = [
      ['font', 'mono'].join('-'),
      ['font', 'serif'].join('-'),
      ['ui', 'monospace'].join('-'),
      ['ui', 'sans-serif'].join('-'),
      ['system', 'ui'].join('-'),
    ]
    const offenders = applicationSources(new URL('../', import.meta.url)).flatMap(({ file, source }) =>
      forbidden.some((token) => source.includes(token)) ? [file] : [],
    )
    expect(offenders).toEqual([])
  })
})
