import { describe, expect, it } from 'vitest'
import type { OutlineData } from '../../../types/spatial'
import {
  dataWithOutlineBriefDetail,
  dataWithOutlineBriefExpanded,
  dataWithOutlineWorkDetail,
  dataWithoutOutlineItem,
  outlineBriefDetails,
  outlineBriefExpandedIds,
  outlineContextLabel,
  outlineRomanMarker,
  outlineSkinMode,
  outlineWorkDetails,
  visibleOutlineItems,
} from './outlineSkinModel'

const data = (): OutlineData => ({
  skin: 'tree',
  items: [
    { id: 'root', text: 'Root', depth: 0, collapsed: false },
    { id: 'child-a', text: 'Child A', depth: 1, collapsed: false },
    { id: 'detail', text: 'Detail', depth: 2, collapsed: false },
    { id: 'child-b', text: 'Child B', depth: 1, collapsed: false },
    { id: 'root-two', text: 'Root two', depth: 0, collapsed: false },
  ],
})

describe('outline skin model', () => {
  it('sanitizes unknown skin names to the tree without changing valid skins', () => {
    expect(outlineSkinMode('course')).toBe('course')
    expect(outlineSkinMode('unknown')).toBe('tree')
    expect(outlineSkinMode(null)).toBe('tree')
  })

  it('hides only descendants of a collapsed branch', () => {
    const source = data()
    source.items[0]!.collapsed = true
    expect(visibleOutlineItems(source.items).map(({ item }) => item.id)).toEqual([
      'root',
      'root-two',
    ])
  })

  it('creates stable Roman, alphabetic, and numeric hierarchy markers', () => {
    const items = data().items
    expect(outlineRomanMarker(items, 0)).toBe('I.')
    expect(outlineRomanMarker(items, 1)).toBe('A.')
    expect(outlineRomanMarker(items, 2)).toBe('1.')
    expect(outlineRomanMarker(items, 3)).toBe('B.')
    expect(outlineRomanMarker(items, 4)).toBe('II.')
  })

  it('gives narrative skins language that matches their hierarchy', () => {
    expect(outlineContextLabel('scenes', 0)).toBe('Act')
    expect(outlineContextLabel('scenes', 2)).toBe('Beat')
    expect(outlineContextLabel('sitemap', 1)).toBe('Page')
    expect(outlineContextLabel('course', 2)).toBe('Exercise')
  })

  it('isolates work owners, estimates, and completion from canonical items', () => {
    const original = data()
    const withOwner = dataWithOutlineWorkDetail(original, 'child-a', {
      owner: 'Mina',
      estimate: '2d',
      complete: true,
    })
    expect(withOwner.items).toEqual(original.items)
    expect(outlineWorkDetails(withOwner)['child-a']).toEqual({
      owner: 'Mina',
      estimate: '2d',
      complete: true,
    })
    expect(withOwner.skin).toBe('work_breakdown')
  })

  it('keeps brief notes, attachments, and disclosure isolated by item', () => {
    const original = data()
    const withDetail = dataWithOutlineBriefDetail(original, 'root', {
      notes: 'Decision summary',
      attachments: ['brief.pdf', 'source.md'],
    })
    const expanded = dataWithOutlineBriefExpanded(withDetail, 'root', true)
    expect(expanded.items).toEqual(original.items)
    expect(outlineBriefDetails(expanded).root).toEqual({
      notes: 'Decision summary',
      attachments: ['brief.pdf', 'source.md'],
    })
    expect(outlineBriefExpandedIds(expanded)).toEqual(['root'])
  })

  it('removes specialist state with the deleted item', () => {
    const withWork = dataWithOutlineWorkDetail(data(), 'child-a', {
      owner: 'Mina',
      estimate: '',
      complete: false,
    })
    const withBrief = dataWithOutlineBriefDetail(withWork, 'child-a', {
      notes: 'No longer needed',
      attachments: [],
    })
    const removed = dataWithoutOutlineItem(withBrief, 'child-a')
    expect(removed.items.some((item) => item.id === 'child-a')).toBe(false)
    expect(outlineWorkDetails(removed)['child-a']).toBeUndefined()
    expect(outlineBriefDetails(removed)['child-a']).toBeUndefined()
  })
})
