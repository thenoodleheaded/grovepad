import type { LinkedListData, LinkedListNode } from '../../../types/spatial'

export type LinkedListSkinMode =
  | 'chain'
  | 'vertical'
  | 'compact'
  | 'focus'
  | 'doubly_linked'
  | 'circular'
  | 'memory_map'

const SKINS = new Set<LinkedListSkinMode>([
  'chain',
  'vertical',
  'compact',
  'focus',
  'doubly_linked',
  'circular',
  'memory_map',
])

export const MAX_LINKED_LIST_NODES = 64
export const MAX_LINKED_LIST_VALUE_LENGTH = 160

export function linkedListSkinMode(raw: unknown): LinkedListSkinMode {
  return typeof raw === 'string' && SKINS.has(raw as LinkedListSkinMode)
    ? raw as LinkedListSkinMode
    : 'chain'
}

function record(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null
}

function cleanValue(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, MAX_LINKED_LIST_VALUE_LENGTH) : ''
}

/**
 * Persisted board data is untrusted. Nodes are bounded, malformed entries are
 * ignored, and duplicate ids are replaced so selection and pointer labels can
 * never address two nodes at once.
 */
export function linkedListNodes(raw: unknown): LinkedListNode[] {
  if (!Array.isArray(raw)) return []
  const result: LinkedListNode[] = []
  const ids = new Set<string>()
  for (let index = 0; index < raw.length && result.length < MAX_LINKED_LIST_NODES; index += 1) {
    const source = record(raw[index])
    if (!source) continue
    const candidate = typeof source.id === 'string'
      ? source.id.trim().slice(0, 80)
      : ''
    let id = candidate || `node-${index + 1}`
    let suffix = 2
    while (ids.has(id)) {
      id = `${candidate || `node-${index + 1}`}-${suffix}`
      suffix += 1
    }
    ids.add(id)
    result.push({ id, value: cleanValue(source.value) })
  }
  return result
}

export function selectedLinkedNodeId(
  nodes: readonly LinkedListNode[],
  raw: unknown,
): string | null {
  if (typeof raw === 'string' && nodes.some((node) => node.id === raw)) return raw
  return nodes[0]?.id ?? null
}

export function linkedNodeIndex(
  nodes: readonly LinkedListNode[],
  selectedId: string | null | undefined,
): number {
  if (nodes.length === 0) return -1
  const index = selectedId ? nodes.findIndex((node) => node.id === selectedId) : -1
  return index >= 0 ? index : 0
}

export function neighboringNodeId(
  nodes: readonly LinkedListNode[],
  selectedId: string | null | undefined,
  direction: -1 | 1,
  wrap = false,
): string | null {
  const index = linkedNodeIndex(nodes, selectedId)
  if (index < 0) return null
  const next = index + direction
  if (next >= 0 && next < nodes.length) return nodes[next]?.id ?? null
  if (!wrap) return nodes[index]?.id ?? null
  return nodes[direction > 0 ? 0 : nodes.length - 1]?.id ?? null
}

export function updateLinkedNode(
  nodes: readonly LinkedListNode[],
  id: string,
  value: string,
): LinkedListNode[] {
  return nodes.map((node) =>
    node.id === id ? { ...node, value: cleanValue(value) } : node)
}

export function removeLinkedNode(
  nodes: readonly LinkedListNode[],
  id: string,
): { nodes: LinkedListNode[]; selectedId: string | null } {
  const index = nodes.findIndex((node) => node.id === id)
  if (index < 0) return { nodes: [...nodes], selectedId: selectedLinkedNodeId(nodes, id) }
  const next = nodes.filter((node) => node.id !== id)
  return {
    nodes: next,
    selectedId: next[Math.min(index, next.length - 1)]?.id ?? null,
  }
}

export function moveLinkedNode(
  nodes: readonly LinkedListNode[],
  id: string,
  direction: -1 | 1,
): LinkedListNode[] {
  const from = nodes.findIndex((node) => node.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= nodes.length) return [...nodes]
  const next = [...nodes]
  const [node] = next.splice(from, 1)
  if (node) next.splice(to, 0, node)
  return next
}

export function appendLinkedNode(
  nodes: readonly LinkedListNode[],
  value: string,
  id: string = crypto.randomUUID(),
): { nodes: LinkedListNode[]; selectedId: string | null } {
  if (nodes.length >= MAX_LINKED_LIST_NODES) {
    return { nodes: [...nodes], selectedId: nodes.at(-1)?.id ?? null }
  }
  const existing = new Set(nodes.map((node) => node.id))
  let uniqueId = id
  let suffix = 2
  while (existing.has(uniqueId)) {
    uniqueId = `${id}-${suffix}`
    suffix += 1
  }
  const node = { id: uniqueId, value: cleanValue(value).trim() || 'New node' }
  return { nodes: [...nodes, node], selectedId: node.id }
}

export function reverseLinkedNodes(nodes: readonly LinkedListNode[]): LinkedListNode[] {
  return [...nodes].reverse()
}

/** Writes the selected value from a circuit, creating the head when empty. */
export function writeCurrentLinkedValue(data: LinkedListData, raw: unknown): LinkedListData {
  const nodes = linkedListNodes(data.nodes)
  const value = cleanValue(typeof raw === 'string' ? raw : String(raw ?? ''))
  const selectedId = selectedLinkedNodeId(nodes, data.selectedId)
  if (!selectedId) {
    const appended = appendLinkedNode(nodes, value, 'node-1')
    return { ...data, nodes: appended.nodes, selectedId: appended.selectedId }
  }
  return { ...data, nodes: updateLinkedNode(nodes, selectedId, value), selectedId }
}

export interface LinkedPointerRow {
  id: string
  index: number
  value: string
  address: string
  previous: string | null
  next: string | null
}

function shortAddress(id: string, index: number): string {
  let hash = 2166136261
  for (const character of id) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const address = ((hash >>> 0) + index * 16).toString(16).padStart(8, '0').slice(-8)
  return `0x${address}`
}

export function linkedPointerRows(
  nodes: readonly LinkedListNode[],
  circular = false,
): LinkedPointerRow[] {
  return nodes.map((node, index) => ({
    id: node.id,
    index,
    value: node.value,
    address: shortAddress(node.id, index),
    previous: index > 0
      ? nodes[index - 1]?.id ?? null
      : circular ? nodes.at(-1)?.id ?? null : null,
    next: index < nodes.length - 1
      ? nodes[index + 1]?.id ?? null
      : circular ? nodes[0]?.id ?? null : null,
  }))
}

/**
 * A circular skin can only keep a small ring legible. Keep the selected node
 * in the visible window and report the rest as overflow rather than shrinking
 * every value into noise.
 */
export function circularLinkedWindow(
  nodes: readonly LinkedListNode[],
  selectedId: string | null | undefined,
  limit = 8,
): { nodes: LinkedListNode[]; overflow: number } {
  if (nodes.length <= limit) return { nodes: [...nodes], overflow: 0 }
  const selected = linkedNodeIndex(nodes, selectedId)
  const before = Math.floor((limit - 1) / 2)
  return {
    nodes: Array.from({ length: limit }, (_, offset) =>
      nodes[(selected - before + offset + nodes.length) % nodes.length]!)
      .filter(Boolean),
    overflow: nodes.length - limit,
  }
}
