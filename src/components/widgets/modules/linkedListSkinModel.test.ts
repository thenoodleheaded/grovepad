import { describe, expect, it } from 'vitest'
import type { LinkedListData } from '../../../types/spatial'
import {
  appendLinkedNode,
  circularLinkedWindow,
  linkedListNodes,
  linkedListSkinMode,
  linkedPointerRows,
  moveLinkedNode,
  neighboringNodeId,
  removeLinkedNode,
  reverseLinkedNodes,
  selectedLinkedNodeId,
  writeCurrentLinkedValue,
} from './linkedListSkinModel'

const nodes = [
  { id: 'a', value: 'Alpha' },
  { id: 'b', value: 'Beta' },
  { id: 'c', value: 'Gamma' },
]

describe('Linked List skin model', () => {
  it('normalizes unknown skins to the classic chain', () => {
    expect(linkedListSkinMode('circular')).toBe('circular')
    expect(linkedListSkinMode('unknown')).toBe('chain')
  })

  it('sanitizes malformed nodes and repairs duplicate ids', () => {
    expect(linkedListNodes([
      { id: 'same', value: 'A' },
      null,
      { id: 'same', value: 'B' },
      { value: 42 },
    ])).toEqual([
      { id: 'same', value: 'A' },
      { id: 'same-2', value: 'B' },
      { id: 'node-4', value: '' },
    ])
  })

  it('falls selection back to the head', () => {
    expect(selectedLinkedNodeId(nodes, 'b')).toBe('b')
    expect(selectedLinkedNodeId(nodes, 'missing')).toBe('a')
    expect(selectedLinkedNodeId([], 'missing')).toBeNull()
  })

  it('moves through the list with optional circular wrapping', () => {
    expect(neighboringNodeId(nodes, 'b', 1)).toBe('c')
    expect(neighboringNodeId(nodes, 'c', 1)).toBe('c')
    expect(neighboringNodeId(nodes, 'c', 1, true)).toBe('a')
    expect(neighboringNodeId(nodes, 'a', -1, true)).toBe('c')
  })

  it('reorders without changing stable node ids', () => {
    expect(moveLinkedNode(nodes, 'b', -1).map((node) => node.id)).toEqual(['b', 'a', 'c'])
    expect(reverseLinkedNodes(nodes).map((node) => node.id)).toEqual(['c', 'b', 'a'])
  })

  it('selects the nearest survivor after removal', () => {
    expect(removeLinkedNode(nodes, 'b')).toEqual({
      nodes: [nodes[0], nodes[2]],
      selectedId: 'c',
    })
    expect(removeLinkedNode([nodes[0]!], 'a')).toEqual({ nodes: [], selectedId: null })
  })

  it('appends a bounded, non-empty node and selects it', () => {
    expect(appendLinkedNode(nodes, '  ', 'd')).toEqual({
      nodes: [...nodes, { id: 'd', value: 'New node' }],
      selectedId: 'd',
    })
  })

  it('writes a circuit value to the current node or creates the head', () => {
    const data = { nodes, selectedId: 'b', skin: 'focus' } as LinkedListData
    expect(writeCurrentLinkedValue(data, 'Changed')).toMatchObject({
      skin: 'focus',
      selectedId: 'b',
      nodes: [nodes[0], { id: 'b', value: 'Changed' }, nodes[2]],
    })
    expect(writeCurrentLinkedValue({ nodes: [], skin: 'chain' }, 'First')).toMatchObject({
      selectedId: 'node-1',
      nodes: [{ id: 'node-1', value: 'First' }],
    })
  })

  it('derives safe forward, backward, and circular pointers', () => {
    expect(linkedPointerRows(nodes).map((row) => [row.previous, row.next])).toEqual([
      [null, 'b'],
      ['a', 'c'],
      ['b', null],
    ])
    expect(linkedPointerRows(nodes, true).map((row) => [row.previous, row.next])).toEqual([
      ['c', 'b'],
      ['a', 'c'],
      ['b', 'a'],
    ])
  })

  it('keeps the selected node inside a bounded circular window', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      value: `Node ${index}`,
    }))
    const window = circularLinkedWindow(many, '10', 5)
    expect(window.nodes.map((node) => node.id)).toEqual(['8', '9', '10', '11', '0'])
    expect(window.overflow).toBe(7)
  })
})
