import { describe, expect, it } from 'vitest'
import { titleCapsuleWidth } from './titleCapsuleWidth'

describe('floating title capsule width', () => {
  it('never reports narrower than two grid cells', () => {
    expect(titleCapsuleWidth('A')).toBeGreaterThanOrEqual(80)
  })

  it('grows with the title and stays grid-aligned', () => {
    const short = titleCapsuleWidth('A')
    const long = titleCapsuleWidth('A considerably longer widget title')
    expect(long).toBeGreaterThan(short)
    expect(long % 40).toBe(0)
  })
})
