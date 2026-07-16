import { describe, expect, it } from 'vitest'
import { extractBuildId, isDifferentDeploy } from './deployVersionMonitor'

describe('deploy version monitor', () => {
  it('extracts the injected build id regardless of meta attribute order', () => {
    expect(extractBuildId('<meta name="grovepad-build" content="build-a">')).toBe('build-a')
    expect(extractBuildId("<meta content='build-b' name='grovepad-build'>")).toBe('build-b')
  })

  it('ignores unrelated or incomplete metadata', () => {
    expect(extractBuildId('<meta name="description" content="grovepad-build">')).toBeNull()
    expect(extractBuildId('<meta name="grovepad-build">')).toBeNull()
  })

  it('only reports a confirmed remote build change', () => {
    expect(isDifferentDeploy('build-a', '<meta name="grovepad-build" content="build-b">')).toBe(true)
    expect(isDifferentDeploy('build-a', '<meta name="grovepad-build" content="build-a">')).toBe(false)
    expect(isDifferentDeploy('build-a', '<html></html>')).toBe(false)
    expect(isDifferentDeploy(null, '<meta name="grovepad-build" content="build-b">')).toBe(false)
  })
})
