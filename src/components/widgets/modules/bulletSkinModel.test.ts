import { describe, expect, it } from 'vitest'
import type { BulletItem } from '../../../types/spatial'
import {
  bulletOutlineState,
  bulletSkin,
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
    expect(bulletSkin('numbered')).toBe('numbered')
    expect(bulletSkin('unknown')).toBe('dots')
    // Boards written before the three retired skins were removed still name
    // them; they fall back to the plain list rather than blanking the card.
    expect(bulletSkin('compact_chips')).toBe('dots')
    expect(bulletSkin('two_column')).toBe('dots')
    expect(bulletSkin('rolling_log')).toBe('dots')
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
})
