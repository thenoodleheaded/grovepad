import { describe, expect, it } from 'vitest'
import { marqueeModeFor, mergeMarqueeSelection } from './marqueeSelection'

describe('marqueeModeFor', () => {
  it('replaces with no modifiers', () => {
    expect(marqueeModeFor({ shift: false, alt: false })).toBe('replace')
  })

  it('adds with shift, because shift also starts the marquee in navigate mode', () => {
    expect(marqueeModeFor({ shift: true, alt: false })).toBe('add')
  })

  it('subtracts with alt, and alt wins over shift', () => {
    expect(marqueeModeFor({ shift: false, alt: true })).toBe('subtract')
    expect(marqueeModeFor({ shift: true, alt: true })).toBe('subtract')
  })
})

describe('mergeMarqueeSelection', () => {
  it('replace keeps only the boxed widgets', () => {
    expect(mergeMarqueeSelection(['a', 'b'], ['c'], 'replace')).toEqual(['c'])
  })

  it('replace with an empty box clears the selection', () => {
    expect(mergeMarqueeSelection(['a', 'b'], [], 'replace')).toEqual([])
  })

  it('add unions without duplicating', () => {
    expect(mergeMarqueeSelection(['a', 'b'], ['b', 'c'], 'add').sort()).toEqual(['a', 'b', 'c'])
  })

  it('subtract removes the boxed widgets and ignores ones not selected', () => {
    expect(mergeMarqueeSelection(['a', 'b', 'c'], ['b', 'z'], 'subtract').sort()).toEqual(['a', 'c'])
  })

  it('subtract can empty the selection', () => {
    expect(mergeMarqueeSelection(['a'], ['a'], 'subtract')).toEqual([])
  })
})
