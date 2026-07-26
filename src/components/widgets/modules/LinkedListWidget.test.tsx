import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LinkedListData } from '../../../types/spatial'
import { LinkedListWidget } from './LinkedListWidget'
import type { LinkedListSkinMode } from './linkedListSkinModel'

const SKINS: LinkedListSkinMode[] = [
  'chain',
  'vertical',
  'compact',
  'focus',
  'doubly_linked',
  'circular',
  'memory_map',
]

const base: LinkedListData = {
  nodes: [
    { id: 'a', value: 'Alpha' },
    { id: 'b', value: 'Beta' },
    { id: 'c', value: 'Gamma' },
  ],
  selectedId: 'b',
  skin: 'chain',
}

function render(skin: LinkedListSkinMode, data: Partial<LinkedListData> = {}) {
  return renderToStaticMarkup(
    <LinkedListWidget
      skin={skin}
      data={{ ...base, ...data, skin }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Linked List skins', () => {
  it.each([
    ['chain', 'gp-linked-chain'],
    ['vertical', 'gp-linked-vertical'],
    ['compact', 'gp-linked-ledger'],
    ['focus', 'gp-linked-focus'],
    ['doubly_linked', 'gp-linked-double'],
    ['circular', 'gp-linked-circle'],
    ['memory_map', 'gp-linked-memory'],
  ] as const)('renders %s with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  it.each(SKINS)('keeps node editing and append available in %s', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('aria-label="New node value"')
    expect(markup).toContain('aria-label="Append node"')
    expect(markup).toContain('gp-bare-field')
  })

  it('marks the semantic ends of the classic chain', () => {
    const markup = render('chain')
    expect(markup).toContain('data-head="true"')
    expect(markup).toContain('data-tail="true"')
    expect(markup).toContain('Tail points to null')
  })

  it('exposes both directions in the doubly-linked skin', () => {
    const markup = render('doubly_linked')
    expect(markup).toContain('gp-linked-double-pointer')
    expect(markup.match(/NULL/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('makes circular nodes stateful controls and explains the loop', () => {
    const markup = render('circular')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Tail → Head')
    expect(markup).toContain('Previous circular node')
    expect(markup).toContain('Next circular node')
  })

  it('shows pointer addresses without treating them as editable values', () => {
    const markup = render('memory_map')
    expect(markup).toContain('Linked list memory map')
    expect(markup).toMatch(/0x[0-9a-f]{8}/)
    expect(markup).toContain('role="columnheader">Address')
  })

  it.each(SKINS)('has a purposeful empty state in %s', (skin) => {
    const markup = render(skin, { nodes: [], selectedId: null })
    expect(markup).toContain('No head yet')
    expect(markup).toContain('Create the head…')
  })
})
