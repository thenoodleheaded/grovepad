import { describe, expect, it } from 'vitest'
import {
  insertDraggedAtPointer,
  mergeReorderDomain,
  screenVectorToLocal,
  visualFlowOrder,
} from './focusModeReorder'

const SLOTS = [
  { id: 'bravo', left: 100, top: 160, width: 120, height: 40 },
  { id: 'charlie', left: 100, top: 220, width: 120, height: 40 },
  { id: 'delta', left: 100, top: 280, width: 120, height: 40 },
] as const

describe('focus-mode reorder geometry', () => {
  it('inserts before the first midpoint', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, { x: 110, y: 170 })).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ])
  })

  it('inserts between the surrounding midpoints', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, { x: 110, y: 230 })).toEqual([
      'bravo',
      'alpha',
      'charlie',
      'delta',
    ])
  })

  it('inserts after the final midpoint', () => {
    expect(insertDraggedAtPointer('alpha', SLOTS, { x: 110, y: 320 })).toEqual([
      'bravo',
      'charlie',
      'delta',
      'alpha',
    ])
  })

  it('normalizes unsorted DOM measurements before choosing a slot', () => {
    expect(insertDraggedAtPointer('alpha', [SLOTS[2], SLOTS[0], SLOTS[1]], { x: 110, y: 230 })).toEqual([
      'bravo',
      'alpha',
      'charlie',
      'delta',
    ])
  })

  it('uses left-to-right order for wrapped panels with slightly staggered tops', () => {
    const wrapped = [
      { id: 'top-left', left: 100, top: 100, width: 110, height: 40 },
      { id: 'top-right', left: 220, top: 106, width: 110, height: 40 },
      { id: 'bottom-left', left: 100, top: 170, width: 110, height: 40 },
      { id: 'bottom-right', left: 220, top: 164, width: 110, height: 40 },
    ]
    expect(insertDraggedAtPointer('dragged', wrapped, { x: 280, y: 184 })).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'dragged',
    ])
    expect(visualFlowOrder(wrapped)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ])
  })

  it('chooses a slot horizontally within a wrapped row', () => {
    const row = [
      { id: 'left', left: 100, top: 100, width: 100, height: 40 },
      { id: 'right', left: 220, top: 104, width: 100, height: 40 },
    ]
    expect(insertDraggedAtPointer('dragged', row, { x: 120, y: 122 })).toEqual([
      'dragged',
      'left',
      'right',
    ])
    expect(insertDraggedAtPointer('dragged', row, { x: 260, y: 122 })).toEqual([
      'left',
      'dragged',
      'right',
    ])
  })
})

describe('focus-mode coordinate conversion', () => {
  it('converts each screen axis with its own widget scale', () => {
    expect(screenVectorToLocal({ x: 120, y: 90 }, 1.5, 0.75)).toEqual({ x: 80, y: 120 })
  })

  it('falls back safely when a scale cannot be measured', () => {
    expect(screenVectorToLocal({ x: 12, y: -8 }, 0, Number.NaN)).toEqual({ x: 12, y: -8 })
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
