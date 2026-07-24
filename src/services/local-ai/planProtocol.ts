import type {
  InterpretationWarning,
  ProposedNode,
  ProposedRelation,
  ThoughtPlan,
} from '../../utils/thoughtInterpreter'
import type { ModuleType, RelationType } from '../../types/spatial'
import { WIDGET_REGISTRY, widgetDefinition } from '../../widgets/registry'

/** Hard safety and usability ceiling for one Quick Add commit. */
export const LOCAL_MODEL_PLAN_MAX_NODES = 48

const MAX_MODEL_RESPONSE_CHARS = 256_000
const MAX_ID_CHARS = 80
const MAX_TITLE_CHARS = 180
const MAX_NODE_TEXT_CHARS = 2_000
const MAX_WARNING_CHARS = 360
const DEFAULT_CONFIDENCE = 0.78

const RELATION_TYPES = new Set<RelationType>([
  'parent',
  'co-parent',
  'cousin',
  'blocker',
  'conflict',
])

const WARNING_CODES = new Set<InterpretationWarning['code']>([
  'ambiguous',
  'fallback',
  'date',
  'relationship',
])

/**
 * Compact schema intended for constrained decoding on small local models.
 * The runtime validator is the security boundary; this object is also useful
 * for engines that support a JSON-schema response format.
 */
export const LOCAL_MODEL_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['v', 'c', 'n', 'r'],
  properties: {
    v: { const: 1 },
    c: { type: 'number', minimum: 0, maximum: 1 },
    n: {
      type: 'array',
      minItems: 1,
      maxItems: LOCAL_MODEL_PLAN_MAX_NODES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 't'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: MAX_ID_CHARS },
          t: { type: 'string' },
          title: { type: 'string', maxLength: MAX_TITLE_CHARS },
          text: { type: 'string', maxLength: MAX_NODE_TEXT_CHARS },
          c: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    r: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'type'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { enum: [...RELATION_TYPES] },
          label: { type: 'string', maxLength: MAX_TITLE_CHARS },
        },
      },
    },
    w: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { enum: [...WARNING_CODES] },
          message: { type: 'string', maxLength: MAX_WARNING_CHARS },
        },
      },
    },
  },
} as const

/**
 * Builds the planner instruction from the live registry. A newly registered
 * widget therefore becomes available to every local model without a second
 * hand-maintained catalog.
 */
export function buildLocalAiPlanSystemPrompt(skeleton?: ThoughtPlan, maxExtras = 4): string {
  const catalog = Object.values(WIDGET_REGISTRY)
    .sort((left, right) => left.type.localeCompare(right.type))
    .map((definition) => `${definition.type}|${definition.label}|${definition.description}`)
    .join('\n')

  const skeletonInstruction = skeleton?.nodes.length ? [
    'Deepen this fixed deterministic skeleton. Keep every listed id and widget type. You may improve titles.',
    `Add at most ${Math.max(0, Math.floor(maxExtras))} extra nodes. Every extra node must have a direct relation to a skeleton node. Preserve every listed skeleton relation.`,
    `Skeleton nodes: ${skeleton.nodes.map((node) => `${node.temporaryId}|${node.widgetType}|${node.title}`).join(';')}`,
    `Skeleton relations: ${skeleton.relations.map((relation) => `${relation.fromTemporaryId}>${relation.toTemporaryId}|${relation.type}`).join(';') || 'none'}`,
  ] : []

  return [
    '/no_think',
    'You are Grovepad Quick Add\'s local planning engine.',
    'Turn the user request into the smallest useful connected widget graph.',
    'Return one JSON object only. Never use markdown or explanatory prose.',
    `Use at most ${LOCAL_MODEL_PLAN_MAX_NODES} nodes. Prefer fewer nodes unless the request explicitly needs a large workspace.`,
    'Every multi-node plan must be connected. Use parent for hierarchy, blocker for prerequisites, conflict for incompatibility, co-parent for shared ownership, and cousin for peer association.',
    'Use short stable ids such as n0, n1. Never invent widget types.',
    'Compact output: {"v":1,"c":0..1,"n":[{"id":"n0","t":"widget_type","title":"short title","text":"source detail","c":0..1}],"r":[{"from":"n0","to":"n1","type":"parent","label":"optional"}],"w":[{"code":"ambiguous|fallback|date|relationship","message":"short warning"}]}',
    'For one node, r must be an empty array. For multiple nodes, include enough relations to connect every node. Do not include widget data; Grovepad supplies safe defaults.',
    'Order sibling nodes by priority: the most urgent or foundational branch first. Use blocker relations for real prerequisites.',
    ...skeletonInstruction,
    'Available widgets (type|label|purpose):',
    catalog,
  ].join('\n')
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstDefined(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return undefined
}

function parseJson(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    try {
      return JSON.parse(repairJson(candidate)) as unknown
    } catch {
      return null
    }
  }
}

/** Removes comments and dangling commas without touching quoted text. */
function repairJson(value: string): string {
  let output = ''
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    const next = value[index + 1]

    if (lineComment) {
      if (char === '\n' || char === '\r') {
        lineComment = false
        output += char
      }
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index++
      }
      continue
    }
    if (inString) {
      output += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      output += char
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index++
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index++
      continue
    }
    if (char === ',') {
      let lookahead = index + 1
      while (/\s/.test(value[lookahead] ?? '')) lookahead++
      if (value[lookahead] === '}' || value[lookahead] === ']') continue
    }
    output += char
  }
  return output
}

function balancedCandidates(value: string): string[] {
  const candidates: string[] = []
  for (let start = 0; start < value.length; start++) {
    const opening = value[start]
    if (opening !== '{' && opening !== '[') continue
    const stack: string[] = []
    let inString = false
    let escaped = false
    for (let index = start; index < value.length; index++) {
      const char = value[index]!
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '{' || char === '[') stack.push(char)
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '['
        if (stack.pop() !== expected) break
        if (stack.length === 0) {
          candidates.push(value.slice(start, index + 1))
          start = index
          break
        }
      }
    }
  }
  return candidates
}

/**
 * Extracts JSON from plain output, fenced output, or prose-wrapped output.
 * Common local-model mistakes (comments and trailing commas) are repaired.
 */
export function extractLocalAiPlanJson(raw: string): unknown | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MODEL_RESPONSE_CHARS) return null
  const cleaned = raw.replace(/^\uFEFF/, '').trim()
  const candidates = [cleaned]
  for (const match of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim())
  }
  candidates.push(...balancedCandidates(cleaned))
  const seen = new Set<string>()
  let firstParsed: unknown | null = null
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    const parsed = parseJson(candidate)
    if (parsed === null) continue
    if (firstParsed === null) firstParsed = parsed
    // Prose may contain an unrelated JSON example before the actual answer.
    // Prefer an object that at least has the model-plan node key.
    if (isRecord(parsed) && (parsed.n !== undefined || parsed.nodes !== undefined)) return parsed
  }
  return firstParsed
}

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

function optionalString(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined) return undefined
  return requiredString(value, maxLength)
}

function optionalConfidence(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null
  return value
}

function moduleType(value: unknown): ModuleType | null {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(WIDGET_REGISTRY, value)) return null
  return value as ModuleType
}

function relationType(value: unknown): RelationType | null {
  return typeof value === 'string' && RELATION_TYPES.has(value as RelationType)
    ? value as RelationType
    : null
}

function warningCode(value: unknown): InterpretationWarning['code'] | null {
  return typeof value === 'string' && WARNING_CODES.has(value as InterpretationWarning['code'])
    ? value as InterpretationWarning['code']
    : null
}

function parseWarnings(value: unknown): InterpretationWarning[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 12) return null
  const warnings: InterpretationWarning[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const code = warningCode(firstDefined(item, 'code', 'c'))
    const message = requiredString(firstDefined(item, 'message', 'm'), MAX_WARNING_CHARS)
    if (!code || !message) return null
    warnings.push({ code, message })
  }
  return warnings
}

type ParsedNode = {
  id: string
  type: ModuleType
  title?: string
  text?: string
  confidence?: number
}

function parseNodes(value: unknown): ParsedNode[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > LOCAL_MODEL_PLAN_MAX_NODES) return null
  const ids = new Set<string>()
  const nodes: ParsedNode[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const id = requiredString(firstDefined(item, 'id', 'temporaryId'), MAX_ID_CHARS)
    const type = moduleType(firstDefined(item, 't', 'type', 'widgetType'))
    const title = optionalString(item.title, MAX_TITLE_CHARS)
    const text = optionalString(firstDefined(item, 'text', 'sourceText'), MAX_NODE_TEXT_CHARS)
    const confidence = optionalConfidence(firstDefined(item, 'c', 'confidence'))
    if (!id || !type || title === null || text === null || confidence === null || ids.has(id)) return null
    ids.add(id)
    nodes.push({ id, type, title, text, confidence })
  }
  return nodes
}

function parseRelations(value: unknown, nodeIds: ReadonlySet<string>): ProposedRelation[] | null {
  if (value === undefined) return nodeIds.size === 1 ? [] : null
  if (!Array.isArray(value) || value.length > LOCAL_MODEL_PLAN_MAX_NODES * 4) return null
  if (nodeIds.size > 1 && value.length === 0) return null
  const relations: ProposedRelation[] = []
  const relationKeys = new Set<string>()
  const parentByChild = new Map<string, string>()

  for (const item of value) {
    if (!isRecord(item)) return null
    const from = requiredString(firstDefined(item, 'from', 'fromTemporaryId'), MAX_ID_CHARS)
    const to = requiredString(firstDefined(item, 'to', 'toTemporaryId'), MAX_ID_CHARS)
    const type = relationType(item.type)
    const label = optionalString(item.label, MAX_TITLE_CHARS)
    if (!from || !to || !type || label === null || from === to || !nodeIds.has(from) || !nodeIds.has(to)) return null
    const key = `${from}\u0000${to}\u0000${type}`
    if (relationKeys.has(key)) return null
    relationKeys.add(key)
    if (type === 'parent') {
      if (parentByChild.has(to)) return null
      parentByChild.set(to, from)
    }
    relations.push({ fromTemporaryId: from, toTemporaryId: to, type, ...(label ? { label } : {}) })
  }

  // Parent edges must be acyclic.
  for (const id of nodeIds) {
    const path = new Set<string>()
    let current: string | undefined = id
    while (current !== undefined) {
      if (path.has(current)) return null
      path.add(current)
      current = parentByChild.get(current)
    }
  }

  // A multi-widget model response must describe one usable graph rather than
  // silently producing unrelated islands on the canvas.
  if (nodeIds.size > 1) {
    const adjacent = new Map<string, string[]>()
    for (const id of nodeIds) adjacent.set(id, [])
    for (const relation of relations) {
      adjacent.get(relation.fromTemporaryId)!.push(relation.toTemporaryId)
      adjacent.get(relation.toTemporaryId)!.push(relation.fromTemporaryId)
    }
    const first = nodeIds.values().next().value as string | undefined
    if (!first) return null
    const visited = new Set([first])
    const queue = [first]
    while (queue.length) {
      const id = queue.shift()!
      for (const neighbour of adjacent.get(id) ?? []) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
    if (visited.size !== nodeIds.size) return null
  }
  return relations
}

function nodeDepths(nodeIds: ReadonlySet<string>, relations: readonly ProposedRelation[]): Map<string, number> | null {
  const parentByChild = new Map<string, string>()
  for (const relation of relations) {
    if (relation.type === 'parent') parentByChild.set(relation.toTemporaryId, relation.fromTemporaryId)
  }
  const depths = new Map<string, number>()
  const depthFor = (id: string, path: ReadonlySet<string>): number | null => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    if (path.has(id)) return null
    const parent = parentByChild.get(id)
    if (!parent) {
      depths.set(id, 0)
      return 0
    }
    const nextPath = new Set(path)
    nextPath.add(id)
    const parentDepth = depthFor(parent, nextPath)
    if (parentDepth === null) return null
    const depth = parentDepth + 1
    depths.set(id, depth)
    return depth
  }
  for (const id of nodeIds) {
    if (depthFor(id, new Set()) === null) return null
  }
  return depths
}

/**
 * Converts an untrusted model value into Grovepad's internal ThoughtPlan.
 * It never accepts model-supplied widget data or metadata.
 */
export function validateAndHydrateLocalAiPlan(value: unknown, sourceText: string): ThoughtPlan | null {
  try {
    if (!isRecord(value) || typeof sourceText !== 'string') return null
    const version = firstDefined(value, 'v', 'version')
    if (version !== undefined && version !== 1) return null
    const nodes = parseNodes(firstDefined(value, 'n', 'nodes'))
    if (!nodes) return null
    const ids = new Set(nodes.map((node) => node.id))
    const relations = parseRelations(firstDefined(value, 'r', 'relations'), ids)
    if (!relations) return null
    const depths = nodeDepths(ids, relations)
    if (!depths) return null
    const planConfidence = optionalConfidence(firstDefined(value, 'c', 'confidence'))
    if (planConfidence === null) return null
    const confidence = planConfidence ?? (
      nodes.some((node) => node.confidence !== undefined)
        ? nodes.reduce((sum, node) => sum + (node.confidence ?? DEFAULT_CONFIDENCE), 0) / nodes.length
        : DEFAULT_CONFIDENCE
    )
    const warnings = parseWarnings(firstDefined(value, 'w', 'warnings'))
    if (!warnings) return null
    if (confidence < 0.65 && !warnings.some((warning) => warning.code === 'ambiguous')) {
      warnings.push({ code: 'ambiguous', message: 'The local model found more than one plausible interpretation.' })
    }
    const normalizedSource = sourceText.trim().slice(0, MAX_NODE_TEXT_CHARS)
    const hydratedNodes: ProposedNode[] = nodes.map((node) => {
      const nodeConfidence = node.confidence ?? confidence
      const nodeSource = node.text ?? normalizedSource
      return {
        temporaryId: node.id,
        widgetType: node.type,
        title: node.title ?? widgetDefinition(node.type).label,
        data: widgetDefinition(node.type).defaultData(),
        sourceText: nodeSource,
        confidence: nodeConfidence,
        depth: depths.get(node.id) ?? 0,
        metadata: {
          badges: [],
          sourceText: nodeSource,
          interpretationConfidence: nodeConfidence,
        },
      }
    })
    return {
      sourceText: normalizedSource,
      confidence,
      nodes: hydratedNodes,
      relations,
      warnings,
    }
  } catch {
    // Default factories and future registry extensions are outside the trust
    // boundary too. Quick Add can always fall back to its deterministic path.
    return null
  }
}

/** Extracts, validates, and hydrates one raw local-model response. */
export function parseLocalAiPlan(raw: string, sourceText: string): ThoughtPlan | null {
  const value = extractLocalAiPlanJson(raw)
  return value === null ? null : validateAndHydrateLocalAiPlan(value, sourceText)
}
