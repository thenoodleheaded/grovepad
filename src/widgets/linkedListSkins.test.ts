import { describe, expect, it } from 'vitest'
import type { LinkedListData } from '../types/spatial'
import { MODULE_TYPES } from '../types/spatial'
import { restingFace } from '../utils/restingFace'
import { dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { commandsFor, fieldsFor } from './fields'
import { WIDGET_REGISTRY, isWidgetTypePublic } from './registry'
import { STRUCTURE_NOTES_WIDGET_DEFINITIONS } from './registry/structureNotesWidgets'

const expected = [
  'chain',
  'vertical',
  'compact',
  'focus',
  'doubly_linked',
  'circular',
  'memory_map',
]

const data: LinkedListData = {
  nodes: [
    { id: 'a', value: 'Alpha' },
    { id: 'b', value: 'Beta' },
    { id: 'c', value: 'Gamma' },
  ],
  selectedId: 'b',
  skin: 'focus',
}

describe('Linked List registry contract', () => {
  it('is a public Structure widget with seven designed skins', () => {
    expect(MODULE_TYPES).toContain('linked_list')
    expect(isWidgetTypePublic('linked_list')).toBe(true)
    expect(WIDGET_REGISTRY.linked_list.category).toBe('structure')
    expect(
      skinsFor({ type: 'linked_list' }, WIDGET_REGISTRY.linked_list)
        .map((skin) => skin.value),
    ).toEqual(expected)
  })

  it('declares every skin by hand with its own icon', () => {
    const declared = STRUCTURE_NOTES_WIDGET_DEFINITIONS.linked_list.skins
    expect(declared.map((skin) => skin.value)).toEqual(expected)
    expect(new Set(declared.map((skin) => skin.icon)).size).toBe(expected.length)
  })

  it('starts with one real head-to-tail chain', () => {
    const initial = WIDGET_REGISTRY.linked_list.defaultData() as LinkedListData
    expect(initial.skin).toBe('chain')
    expect(initial.nodes.map((node) => node.value)).toEqual(['Head', 'Middle', 'Tail'])
    expect(new Set(initial.nodes.map((node) => node.id)).size).toBe(3)
  })

  it('wears another skin without changing nodes or selection', () => {
    const worn = dataWearingSkin(
      { type: 'linked_list', data },
      'memory_map',
      WIDGET_REGISTRY.linked_list,
    ) as LinkedListData
    expect(worn.skin).toBe('memory_map')
    expect(worn.nodes).toEqual(data.nodes)
    expect(worn.selectedId).toBe('b')
    expect(worn).not.toHaveProperty('mode')
  })
})

describe('Linked List circuit contract', () => {
  it('keeps stable field order and reads head, tail, current, and length', () => {
    const fields = fieldsFor('linked_list')
    expect(fields.map((field) => field.key))
      .toEqual(['head', 'tail', 'current', 'length', 'empty'])
    expect(fields[0]!.get(data)).toBe('Alpha')
    expect(fields[1]!.get(data)).toBe('Gamma')
    expect(fields[2]!.get(data)).toBe('Beta')
    expect(fields[3]!.get(data)).toBe(3)
    expect(fields[4]!.get(data)).toBe(false)
  })

  it('writes the current value without stripping the worn skin', () => {
    const current = fieldsFor('linked_list').find((field) => field.key === 'current')!
    const next = current.set!(data, 'Changed') as LinkedListData
    expect(next.nodes[1]).toEqual({ id: 'b', value: 'Changed' })
    expect(next.skin).toBe('focus')
    expect(next.selectedId).toBe('b')
  })

  it('supports traversal, appending, reversal, and removal as commands', () => {
    const commands = new Map(commandsFor('linked_list').map((command) => [command.key, command]))
    expect([...commands.keys()])
      .toEqual(['add_node', 'next', 'previous', 'reverse', 'remove_current', 'head'])

    const advanced = commands.get('next')!.run(data) as LinkedListData
    expect(advanced.selectedId).toBe('c')
    const appended = commands.get('add_node')!.run(advanced, 'Delta') as LinkedListData
    expect(appended.nodes.at(-1)?.value).toBe('Delta')
    expect(appended.skin).toBe('focus')
    const reversed = commands.get('reverse')!.run(appended) as LinkedListData
    expect(reversed.nodes[0]?.value).toBe('Delta')
    const removed = commands.get('remove_current')!.run(reversed) as LinkedListData
    expect(removed.nodes.some((node) => node.id === appended.selectedId)).toBe(false)
  })

  it('wraps traversal only while wearing Circular', () => {
    const next = commandsFor('linked_list').find((command) => command.key === 'next')!
    expect((next.run({ ...data, selectedId: 'c' }) as LinkedListData).selectedId).toBe('c')
    expect((next.run({ ...data, selectedId: 'c', skin: 'circular' }) as LinkedListData).selectedId)
      .toBe('a')
  })
})

describe('Linked List resting face', () => {
  it('shows real node values rather than only a count', () => {
    expect(restingFace({
      type: 'linked_list',
      title: 'Sequence',
      size: { width: 360, height: 240 },
      data,
    }).model).toMatchObject({
      kind: 'rows',
      rows: [
        { label: 'Head', value: 'Alpha' },
        { value: 'Beta' },
        { label: 'Tail', value: 'Gamma' },
      ],
      overflow: 0,
    })
  })
})
