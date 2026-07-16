import { describe, expect, it } from 'vitest'
import { pillSizeForTitle } from './collapsedWidget'

describe('collapsed widget representation', () => {
  it('keeps old collapsed pills at least two cells wide', () => {
    expect(pillSizeForTitle('A')).toMatchObject({ height: 40 })
    expect(pillSizeForTitle('A').width).toBeGreaterThanOrEqual(80)
  })
})
