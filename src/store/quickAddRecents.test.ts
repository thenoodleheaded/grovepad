import { describe, expect, it } from 'vitest'
import {
  normalizeQuickAddEntry,
  promoteQuickAddRecent,
  QUICK_ADD_RECENT_LIMIT,
} from './quickAddRecents'

describe('normalizeQuickAddEntry', () => {
  it('trims and collapses runs of whitespace', () => {
    expect(normalizeQuickAddEntry('  plan   my \n week  ')).toBe('plan my week')
  })

  it('reduces a whitespace-only entry to nothing', () => {
    expect(normalizeQuickAddEntry('   \n\t ')).toBe('')
  })

  it('caps a long entry so a pasted paragraph cannot become a chip', () => {
    expect(normalizeQuickAddEntry('x'.repeat(200))).toHaveLength(80)
  })
})

describe('promoteQuickAddRecent', () => {
  it('puts the newest entry first', () => {
    expect(promoteQuickAddRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('ignores an empty entry and leaves the list alone', () => {
    expect(promoteQuickAddRecent(['a'], '   ')).toEqual(['a'])
  })

  it('de-duplicates case-insensitively, keeping the newest casing', () => {
    expect(promoteQuickAddRecent(['Plan my week', 'b'], 'plan MY week')).toEqual([
      'plan MY week',
      'b',
    ])
  })

  it('caps the list at the recent limit', () => {
    const full = Array.from({ length: QUICK_ADD_RECENT_LIMIT }, (_, i) => `entry ${i}`)
    const next = promoteQuickAddRecent(full, 'fresh')
    expect(next).toHaveLength(QUICK_ADD_RECENT_LIMIT)
    expect(next[0]).toBe('fresh')
    expect(next).not.toContain(`entry ${QUICK_ADD_RECENT_LIMIT - 1}`)
  })

  it('normalizes the entry it stores', () => {
    expect(promoteQuickAddRecent([], '  trip  to   japan?  ')[0]).toBe('trip to japan?')
  })
})
