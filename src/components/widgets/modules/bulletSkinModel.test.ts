import { describe, expect, it } from 'vitest'
import type { BulletItem } from '../../../types/spatial'
import {
  bulletLogState,
  bulletOutlineState,
  bulletSkin,
  orderedLogItems,
  visibleOutlineItems,
} from './bulletSkinModel'

const items: BulletItem[] = [
  { id: 'parent', text: 'Parent' },
  { id: 'child', text: 'Child' },
  { id: 'grandchild', text: 'Grandchild' },
  { id: 'next', text: 'Next' },
]

describe('Bullets skin model', () => {
  it('sanitizes skin names and outline depth', () => {
    expect(bulletSkin('compact_chips')).toBe('compact_chips')
    expect(bulletSkin('unknown')).toBe('dots')
    expect(bulletOutlineState({
      levels: { parent: 3, child: 8, grandchild: 2, missing: 1 },
      collapsedIds: ['parent', 'missing'],
    }, items)).toEqual({
      levels: { child: 1, grandchild: 2 },
      collapsedIds: ['parent'],
    })
  })

  it('hides descendants of a collapsed outline row without hiding its siblings', () => {
    const state = bulletOutlineState({
      levels: { child: 1, grandchild: 2 },
      collapsedIds: ['parent'],
    }, items)
    expect(visibleOutlineItems(items, state).map(({ item }) => item.id)).toEqual([
      'parent',
      'next',
    ])
  })

  it('sanitizes timestamps and orders log entries in either direction', () => {
    const state = bulletLogState({
      order: 'newest',
      timestamps: {
        parent: '2026-07-25T10:00:00.000Z',
        child: '2026-07-25T12:00:00.000Z',
        next: 'not-a-date',
        missing: '2026-07-25T13:00:00.000Z',
      },
    }, items)
    expect(state.timestamps).toEqual({
      parent: '2026-07-25T10:00:00.000Z',
      child: '2026-07-25T12:00:00.000Z',
    })
    expect(orderedLogItems(items, state).map((item) => item.id)).toEqual([
      'child',
      'parent',
      'next',
      'grandchild',
    ])
    expect(orderedLogItems(items, { ...state, order: 'oldest' }).map((item) => item.id)).toEqual([
      'grandchild',
      'next',
      'parent',
      'child',
    ])
  })
})
