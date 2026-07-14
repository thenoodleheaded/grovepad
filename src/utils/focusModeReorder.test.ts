import { describe, expect, it } from 'vitest'
import { insertDraggedAtPointer, mergeReorderDomain } from './focusModeReorder'

const SLOTS = [
  { id: 'bravo', top: 160, height: 40 },
  { id: 'charlie', top: 220, height: 40 },
  { id: 'delta', top: 280, height: 40 },
] as const

describe('focus-mode reorder geometry', () => {
  it('inserts before the first midpoint', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, 170)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ])
  })

  it('inserts between the surrounding midpoints', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, 230)).toEqual([
      'bravo',
      'alpha',
      'charlie',
      'delta',
    ])
  })

  it('inserts after the final midpoint', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, 320)).toEqual([
      'bravo',
      'charlie',
      'delta',
      'alpha',
    ])
  })

  it('normalizes unsorted DOM measurements before choosing a slot', () => {
    expect(insertDraggedAtPointer('alpha', [SLOTS[2], SLOTS[0], SLOTS[1]], 230)).toEqual([
      'bravo',
      'alpha',
      'charlie',
      'delta',
    ])
  })
})

describe('focus-mode persisted order', () => {
  it('reorders one flow domain without moving islands in another wrapper', () => {
    expect(
      mergeReorderDomain(
        ['summary', 'alpha', 'chart', 'bravo', 'charlie'],
        ['summary', 'alpha', 'chart', 'bravo', 'charlie'],
        ['bravo', 'charlie', 'alpha'],
      ),
    ).toEqual(['summary', 'bravo', 'chart', 'charlie', 'alpha'])
  })

  it('drops stale ids and appends newly mounted islands deterministically', () => {
    expect(
      mergeReorderDomain(
        ['stale', 'alpha', 'bravo'],
        ['summary', 'alpha', 'bravo', 'delta'],
        ['bravo', 'alpha'],
      ),
    ).toEqual(['bravo', 'alpha', 'summary', 'delta'])
  })
})
