import type { Vector2D, Widget } from '../types/spatial'
import type { Relation } from '../types/relations'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'

export const MCP_TREE_LIMITS = {
  maxNodes: 60,
  maxDepth: 8,
  maxTitleLength: 120,
  maxNoteLength: 4_000,
  previewLifetimeMs: 10 * 60 * 1_000,
} as const

interface McpTreeNode {
  id: string
  title: string
  parentId: string | null
  note: string
  depth: number
}

export interface McpTreeDraft {
  canvasId: string
  origin: Vector2D
  nodes: McpTreeNode[]
}

export interface McpTreePreview extends McpTreeDraft {
  previewId: string
  createdAt: number
  expiresAt: number
}

export interface McpCanvasOutlineNode {
  id: string
  title: string
  type: Widget['type']
  parentIds: string[]
  note?: string
}

class McpContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpContractError'
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpContractError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function boundedText(value: unknown, label: string, maxLength: number, required: boolean): string {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return ''
    throw new McpContractError(`${label} must be text`)
  }
  const normalized = value.trim()
  if (required && normalized.length === 0) throw new McpContractError(`${label} cannot be empty`)
  if (normalized.length > maxLength) {
    throw new McpContractError(`${label} cannot exceed ${maxLength} characters`)
  }
  return normalized
}

function finiteCoordinate(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new McpContractError(`${label} must be a finite number`)
  }
  return value
}

/** Browser-side validation is intentionally independent from the MCP process.
 * The local bridge is a transport, not a trusted source of board mutations. */
export function normalizeMcpTreeDraft(
  input: unknown,
  defaultCanvasId: string,
  defaultOrigin: Vector2D,
): McpTreeDraft {
  const draft = record(input, 'Tree')
  const canvasId = draft.canvasId === undefined
    ? defaultCanvasId
    : boundedText(draft.canvasId, 'canvasId', 160, true)
  if (!Array.isArray(draft.nodes)) throw new McpContractError('nodes must be a list')
  if (draft.nodes.length === 0) throw new McpContractError('A tree needs at least one node')
  if (draft.nodes.length > MCP_TREE_LIMITS.maxNodes) {
    throw new McpContractError(`A tree can contain at most ${MCP_TREE_LIMITS.maxNodes} nodes`)
  }

  const origin = draft.origin === undefined ? defaultOrigin : (() => {
    const value = record(draft.origin, 'origin')
    return {
      x: finiteCoordinate(value.x, defaultOrigin.x, 'origin.x'),
      y: finiteCoordinate(value.y, defaultOrigin.y, 'origin.y'),
    }
  })()

  const ids = new Set<string>()
  const normalized = draft.nodes.map((rawNode, index) => {
    const node = record(rawNode, `nodes[${index}]`)
    const id = boundedText(node.id, `nodes[${index}].id`, 80, true)
    if (ids.has(id)) throw new McpContractError(`Node id "${id}" is duplicated`)
    ids.add(id)
    const parentId = node.parentId === undefined || node.parentId === null
      ? null
      : boundedText(node.parentId, `nodes[${index}].parentId`, 80, true)
    return {
      id,
      title: boundedText(node.title, `nodes[${index}].title`, MCP_TREE_LIMITS.maxTitleLength, true),
      parentId,
      note: boundedText(node.note, `nodes[${index}].note`, MCP_TREE_LIMITS.maxNoteLength, false),
      depth: 0,
    }
  })

  for (const node of normalized) {
    if (node.parentId === node.id) throw new McpContractError(`Node "${node.id}" cannot parent itself`)
    if (node.parentId && !ids.has(node.parentId)) {
      throw new McpContractError(`Node "${node.id}" references missing parent "${node.parentId}"`)
    }
  }

  const byId = new Map(normalized.map((node) => [node.id, node]))
  const depthCache = new Map<string, number>()
  const findDepth = (id: string, path: Set<string>): number => {
    const cached = depthCache.get(id)
    if (cached !== undefined) return cached
    if (path.has(id)) throw new McpContractError(`The tree contains a cycle through "${id}"`)
    const node = byId.get(id)
    if (!node) return 0
    const nextPath = new Set(path).add(id)
    const depth = node.parentId ? findDepth(node.parentId, nextPath) + 1 : 0
    if (depth > MCP_TREE_LIMITS.maxDepth) {
      throw new McpContractError(`Tree depth cannot exceed ${MCP_TREE_LIMITS.maxDepth}`)
    }
    depthCache.set(id, depth)
    return depth
  }
  for (const node of normalized) node.depth = findDepth(node.id, new Set())

  return { canvasId, origin, nodes: normalized }
}

export function thoughtPlanFromMcpTree(draft: McpTreeDraft): ThoughtPlan {
  const sourceText = draft.nodes
    .map((node) => `${'  '.repeat(node.depth)}- ${node.title}`)
    .join('\n')
  return {
    sourceText,
    confidence: 1,
    nodes: draft.nodes.map((node) => ({
      temporaryId: node.id,
      widgetType: 'notes',
      title: node.title,
      data: { text: node.note, mode: 'plain', color: 'yellow', attribution: '' },
      sourceText: node.note || node.title,
      confidence: 1,
      depth: node.depth,
      metadata: {
        badges: [],
        sourceText: node.note || node.title,
        interpretationConfidence: 1,
      },
    })),
    relations: draft.nodes.flatMap((node) => node.parentId ? [{
      fromTemporaryId: node.parentId,
      toTemporaryId: node.id,
      type: 'parent' as const,
    }] : []),
    warnings: [],
  }
}

/** A bounded, semantic view for AI clients. It exposes titles and Note text,
 * never the entire persisted board document or unknown future fields. */
export function canvasOutline(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  canvasId: string,
  includeNoteText = true,
): { nodes: McpCanvasOutlineNode[]; truncated: boolean } {
  const all = Object.values(widgets)
    .filter((widget) => widget.canvasId === canvasId)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id))
  const visible = all.slice(0, 200)
  const visibleIds = new Set(visible.map((widget) => widget.id))
  const parentIds = new Map<string, string[]>()
  for (const relation of Object.values(relations)) {
    if (relation.type !== 'parent' || !visibleIds.has(relation.fromId) || !visibleIds.has(relation.toId)) continue
    const current = parentIds.get(relation.toId) ?? []
    current.push(relation.fromId)
    parentIds.set(relation.toId, current)
  }
  return {
    nodes: visible.map((widget) => {
      const text = widget.type === 'notes' && includeNoteText
        && 'text' in widget.data && typeof widget.data.text === 'string'
        ? widget.data.text.slice(0, 1_000)
        : undefined
      return {
        id: widget.id,
        title: widget.title,
        type: widget.type,
        parentIds: parentIds.get(widget.id) ?? [],
        ...(text !== undefined ? { note: text } : {}),
      }
    }),
    truncated: all.length > visible.length,
  }
}
