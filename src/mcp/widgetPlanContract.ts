import type { ModuleType, Size, Vector2D, Widget } from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'
import type { Relation, RelationType } from '../types/relations'
import type { Connection } from '../types/circuit'
import type { CloudCanvasDocument } from '../utils/cloudDocuments'
import type { ModuleData } from '../types/widgetData'
import { widgetDefinition } from '../widgets/registry'
import { fieldsFor, commandsFor } from '../widgets/fields'

// ---------------------------------------------------------------------------
// The widget-plan contract — the "Grovepad language" an AI host speaks.
//
// This is the sibling of treeContract.ts: that one lets a model draw a tree of
// Note cards, this one lets it place real widgets of many types, link them, and
// wire them together. Both obey the same rule: the transport is never a trusted
// source of board mutations. Input either normalizes to a valid plan or throws a
// message written for a model to read and retry against.
//
// Widget data always starts from the registry's own defaultData() and is then
// overlaid with individually validated fields. A model can therefore never
// inject an unknown, executable, or malformed data shape — the worst it can do
// is write text into a field the registry already owns.
// ---------------------------------------------------------------------------

/** Kept deliberately in step with MCP_TREE_LIMITS so both connectors refuse at
 *  the same scale, and a model that learned one already knows the other. */
export const MCP_PLAN_LIMITS = {
  maxWidgets: 60,
  maxDepth: 8,
  maxTitleLength: 120,
  maxTextLength: 4_000,
  /** Rows/items inside a single widget (checklist items, table rows, bars...). */
  maxItemsPerWidget: 50,
  maxItemTextLength: 200,
  maxTableColumns: 12,
  maxRelations: 120,
  maxWires: 60,
  previewLifetimeMs: 10 * 60 * 1_000,
} as const

/**
 * The curated subset an AI may create. Locked with the owner on 2026-08-31.
 * These are the shapes a written answer lands in naturally; everything else in
 * the registry stays human-only for now. Widening this list is a one-line
 * change plus a test — start narrow on purpose.
 */
export const PLANNABLE_WIDGET_TYPES = [
  'text',
  'bullets',
  'checklist',
  'table',
  'outline',
  'pros_cons',
  'poll',
  'habit',
  'counter',
  'rating',
  'toggle',
  'date_picker',
  'timekeeper',
  'bar_chart',
  'metrics',
] as const

export type PlannableWidgetType = (typeof PLANNABLE_WIDGET_TYPES)[number]

const PLANNABLE = new Set<string>(PLANNABLE_WIDGET_TYPES)

const RELATION_TYPES: readonly RelationType[] = ['parent', 'co-parent', 'cousin', 'blocker', 'conflict']

export interface WidgetPlanNode {
  id: string
  type: PlannableWidgetType
  title: string
  data: ModuleData
  parentId: string | null
  /** World coordinates. Absent means "lay it out for me". */
  position?: Vector2D
  depth: number
}

export interface WidgetPlanRelation {
  fromId: string
  toId: string
  type: RelationType
}

export interface WidgetPlanWire {
  fromId: string
  fromField: string
  toId: string
  kind: 'value' | 'trigger'
  toField?: string
  command?: string
  edge?: 'rising' | 'falling' | 'change'
}

export interface WidgetPlan {
  canvasId: string
  origin: Vector2D
  nodes: WidgetPlanNode[]
  relations: WidgetPlanRelation[]
  wires: WidgetPlanWire[]
}

export interface WidgetPlanPreview extends WidgetPlan {
  previewId: string
  createdAt: number
  expiresAt: number
}

/** Errors are instructions, not diagnostics: the model reads them and retries. */
export class McpPlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpPlanError'
  }
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpPlanError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function boundedText(value: unknown, label: string, maxLength: number, required: boolean): string {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return ''
    throw new McpPlanError(`${label} must be text`)
  }
  const normalized = value.trim()
  if (required && normalized.length === 0) throw new McpPlanError(`${label} cannot be empty`)
  if (normalized.length > maxLength) {
    throw new McpPlanError(
      `${label} is ${normalized.length} characters and cannot exceed ${maxLength}; shorten it and retry`,
    )
  }
  return normalized
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new McpPlanError(`${label} must be a finite number`)
  }
  return value
}

function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new McpPlanError(`${label} must be true or false`)
  return value
}

function boundedList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new McpPlanError(`${label} must be a list`)
  if (value.length > MCP_PLAN_LIMITS.maxItemsPerWidget) {
    throw new McpPlanError(
      `${label} has ${value.length} entries and cannot exceed ${MCP_PLAN_LIMITS.maxItemsPerWidget}`,
    )
  }
  return value
}

/** Item text lists arrive either as plain strings or as objects with a text
 *  field; models produce both and neither is wrong. */
function itemText(entry: unknown, label: string, key = 'text'): string {
  if (typeof entry === 'string') return boundedText(entry, label, MCP_PLAN_LIMITS.maxItemTextLength, true)
  const asRecord = record(entry, label)
  return boundedText(asRecord[key], `${label}.${key}`, MCP_PLAN_LIMITS.maxItemTextLength, true)
}

let idCounter = 0
/** Deterministic-friendly id source: tests inject their own, production uses
 *  crypto.randomUUID through the default factory. */
export type IdFactory = () => string
const defaultIdFactory: IdFactory = () => crypto.randomUUID()

function localId(): string {
  idCounter += 1
  return `plan-${idCounter}`
}

// ---------------------------------------------------------------------------
// Per-type content normalizers
//
// Each returns a patch applied over the registry's defaultData(). Field names
// come from src/types/widgetData*.ts — never invented here.
// ---------------------------------------------------------------------------

type ContentNormalizer = (content: Record<string, unknown>, label: string, ids: IdFactory) => Record<string, unknown>

const CONTENT_NORMALIZERS: Record<PlannableWidgetType, ContentNormalizer> = {
  text: (content, label) => ({
    text: boundedText(content.text, `${label}.text`, MCP_PLAN_LIMITS.maxTextLength, false),
  }),

  bullets: (content, label, ids) => ({
    items: boundedList(content.items, `${label}.items`).map((entry, i) => ({
      id: ids(),
      text: itemText(entry, `${label}.items[${i}]`),
    })),
  }),

  checklist: (content, label, ids) => ({
    items: boundedList(content.items, `${label}.items`).map((entry, i) => {
      const itemLabel = `${label}.items[${i}]`
      if (typeof entry === 'string') {
        return { id: ids(), label: boundedText(entry, itemLabel, MCP_PLAN_LIMITS.maxItemTextLength, true), done: false }
      }
      const asRecord = record(entry, itemLabel)
      return {
        id: ids(),
        label: boundedText(asRecord.label, `${itemLabel}.label`, MCP_PLAN_LIMITS.maxItemTextLength, true),
        done: boolean(asRecord.done, `${itemLabel}.done`, false),
      }
    }),
  }),

  table: (content, label) => {
    const rows = boundedList(content.rows, `${label}.rows`)
    if (rows.length === 0) throw new McpPlanError(`${label}.rows needs at least one row`)
    const width = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : 0
    if (width === 0) throw new McpPlanError(`${label}.rows[0] must be a non-empty list of cells`)
    if (width > MCP_PLAN_LIMITS.maxTableColumns) {
      throw new McpPlanError(`${label} has ${width} columns and cannot exceed ${MCP_PLAN_LIMITS.maxTableColumns}`)
    }
    return {
      rows: rows.map((row, r) => {
        if (!Array.isArray(row)) throw new McpPlanError(`${label}.rows[${r}] must be a list of cells`)
        if (row.length !== width) {
          throw new McpPlanError(
            `${label}.rows[${r}] has ${row.length} cells but row 0 has ${width}; every row needs the same number`,
          )
        }
        return row.map((cell, c) =>
          boundedText(cell, `${label}.rows[${r}][${c}]`, MCP_PLAN_LIMITS.maxItemTextLength, false),
        )
      }),
    }
  },

  outline: (content, label, ids) => ({
    items: boundedList(content.items, `${label}.items`).map((entry, i) => {
      const itemLabel = `${label}.items[${i}]`
      const depth = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).depth
        : undefined
      const resolvedDepth = depth === undefined ? 0 : finiteNumber(depth, `${itemLabel}.depth`)
      if (resolvedDepth < 0 || resolvedDepth > MCP_PLAN_LIMITS.maxDepth || !Number.isInteger(resolvedDepth)) {
        throw new McpPlanError(
          `${itemLabel}.depth must be a whole number between 0 and ${MCP_PLAN_LIMITS.maxDepth}`,
        )
      }
      return { id: ids(), text: itemText(entry, itemLabel), depth: resolvedDepth, collapsed: false }
    }),
  }),

  pros_cons: (content, label, ids) => ({
    topic: boundedText(content.topic, `${label}.topic`, MCP_PLAN_LIMITS.maxTitleLength, false),
    pros: boundedList(content.pros ?? [], `${label}.pros`).map((entry, i) => ({
      id: ids(),
      text: itemText(entry, `${label}.pros[${i}]`),
    })),
    cons: boundedList(content.cons ?? [], `${label}.cons`).map((entry, i) => ({
      id: ids(),
      text: itemText(entry, `${label}.cons[${i}]`),
    })),
  }),

  poll: (content, label, ids) => ({
    question: boundedText(content.question, `${label}.question`, MCP_PLAN_LIMITS.maxTitleLength, true),
    options: boundedList(content.options, `${label}.options`).map((entry, i) => ({
      id: ids(),
      label: itemText(entry, `${label}.options[${i}]`, 'label'),
      votes: 0,
    })),
  }),

  habit: (content, label) => ({
    label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
    days: [false, false, false, false, false, false, false],
    streak: 0,
  }),

  counter: (content, label) => {
    const patch: Record<string, unknown> = {
      label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
    }
    if (content.count !== undefined) patch.count = finiteNumber(content.count, `${label}.count`)
    if (content.step !== undefined) {
      const step = finiteNumber(content.step, `${label}.step`)
      if (step <= 0) throw new McpPlanError(`${label}.step must be greater than zero`)
      patch.step = step
    }
    return patch
  },

  rating: (content, label) => {
    const patch: Record<string, unknown> = {
      label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
    }
    if (content.value !== undefined) {
      const value = finiteNumber(content.value, `${label}.value`)
      if (value < 0 || value > 5) throw new McpPlanError(`${label}.value must be between 0 and 5`)
      patch.value = value
    }
    return patch
  },

  toggle: (content, label) => ({
    label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
    value: boolean(content.value, `${label}.value`, false),
  }),

  date_picker: (content, label) => {
    const date = boundedText(content.date, `${label}.date`, 10, true)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new McpPlanError(`${label}.date must be an ISO day like 2026-03-14`)
    }
    const time = boundedText(content.time, `${label}.time`, 5, false)
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new McpPlanError(`${label}.time must be 24-hour HH:mm like 14:30`)
    }
    return {
      label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
      date,
      time,
      includeTime: boolean(content.includeTime, `${label}.includeTime`, time.length > 0),
    }
  },

  /** Only the countdown leg is model-settable; pomodoro/stopwatch/deadline keep
   *  their registry defaults so switching timer views never lands on junk. */
  timekeeper: (content, label) => {
    const minutes = content.minutes === undefined ? 5 : finiteNumber(content.minutes, `${label}.minutes`)
    if (minutes <= 0 || minutes > 24 * 60) {
      throw new McpPlanError(`${label}.minutes must be between 1 and 1440`)
    }
    const seconds = Math.round(minutes * 60)
    return {
      mode: 'countdown',
      countdown: {
        label: boundedText(content.label, `${label}.label`, MCP_PLAN_LIMITS.maxTitleLength, true),
        durationSeconds: seconds,
        remainingSeconds: seconds,
        endAt: null,
      },
    }
  },

  bar_chart: (content, label, ids) => ({
    title: boundedText(content.title, `${label}.title`, MCP_PLAN_LIMITS.maxTitleLength, false),
    bars: boundedList(content.bars, `${label}.bars`).map((entry, i) => {
      const barLabel = `${label}.bars[${i}]`
      const asRecord = record(entry, barLabel)
      return {
        id: ids(),
        label: boundedText(asRecord.label, `${barLabel}.label`, MCP_PLAN_LIMITS.maxItemTextLength, true),
        value: finiteNumber(asRecord.value, `${barLabel}.value`),
      }
    }),
  }),

  metrics: (content, label, ids) => ({
    tiles: boundedList(content.tiles, `${label}.tiles`).map((entry, i) => {
      const tileLabel = `${label}.tiles[${i}]`
      const asRecord = record(entry, tileLabel)
      const trend = asRecord.trend === undefined ? 'flat' : asRecord.trend
      if (trend !== 'up' && trend !== 'down' && trend !== 'flat') {
        throw new McpPlanError(`${tileLabel}.trend must be "up", "down", or "flat"`)
      }
      return {
        id: ids(),
        label: boundedText(asRecord.label, `${tileLabel}.label`, MCP_PLAN_LIMITS.maxItemTextLength, true),
        value: boundedText(asRecord.value, `${tileLabel}.value`, 40, true),
        unit: boundedText(asRecord.unit, `${tileLabel}.unit`, 16, false),
        trend,
      }
    }),
  })
}

function normalizeContent(
  type: PlannableWidgetType,
  rawContent: unknown,
  label: string,
  ids: IdFactory,
): ModuleData {
  const content = rawContent === undefined ? {} : record(rawContent, `${label}.content`)
  const patch = CONTENT_NORMALIZERS[type](content, `${label}.content`, ids)
  const base = widgetDefinition(type).defaultData() as Record<string, unknown>
  return { ...base, ...patch } as ModuleData
}

// ---------------------------------------------------------------------------
// Plan normalization
// ---------------------------------------------------------------------------

export function normalizeWidgetPlan(
  input: unknown,
  defaultCanvasId: string,
  defaultOrigin: Vector2D,
  idFactory: IdFactory = localId,
): WidgetPlan {
  const plan = record(input, 'Plan')
  const canvasId = plan.canvasId === undefined
    ? defaultCanvasId
    : boundedText(plan.canvasId, 'canvasId', 160, true)

  if (!Array.isArray(plan.widgets)) throw new McpPlanError('widgets must be a list')
  if (plan.widgets.length === 0) throw new McpPlanError('A plan needs at least one widget')
  if (plan.widgets.length > MCP_PLAN_LIMITS.maxWidgets) {
    throw new McpPlanError(
      `A plan can contain at most ${MCP_PLAN_LIMITS.maxWidgets} widgets; split the work across several plans`,
    )
  }

  const origin = plan.origin === undefined ? defaultOrigin : (() => {
    const value = record(plan.origin, 'origin')
    return {
      x: value.x === undefined ? defaultOrigin.x : finiteNumber(value.x, 'origin.x'),
      y: value.y === undefined ? defaultOrigin.y : finiteNumber(value.y, 'origin.y'),
    }
  })()

  const ids = new Set<string>()
  const nodes: WidgetPlanNode[] = plan.widgets.map((rawWidget, index) => {
    const label = `widgets[${index}]`
    const widget = record(rawWidget, label)
    const id = boundedText(widget.id, `${label}.id`, 80, true)
    if (ids.has(id)) throw new McpPlanError(`Widget id "${id}" is used twice; every id must be unique`)
    ids.add(id)

    const type = boundedText(widget.type, `${label}.type`, 40, true)
    if (!PLANNABLE.has(type)) {
      throw new McpPlanError(
        `"${type}" is not a widget an AI can create. Allowed types: ${PLANNABLE_WIDGET_TYPES.join(', ')}`,
      )
    }

    const parentId = widget.parentId === undefined || widget.parentId === null
      ? null
      : boundedText(widget.parentId, `${label}.parentId`, 80, true)

    const position = widget.position === undefined ? undefined : (() => {
      const value = record(widget.position, `${label}.position`)
      return { x: finiteNumber(value.x, `${label}.position.x`), y: finiteNumber(value.y, `${label}.position.y`) }
    })()

    return {
      id,
      type: type as PlannableWidgetType,
      title: boundedText(widget.title, `${label}.title`, MCP_PLAN_LIMITS.maxTitleLength, true),
      data: normalizeContent(type as PlannableWidgetType, widget.content, label, idFactory),
      parentId,
      position,
      depth: 0,
    }
  })

  for (const node of nodes) {
    if (node.parentId === node.id) throw new McpPlanError(`Widget "${node.id}" cannot be its own parent`)
    if (node.parentId && !ids.has(node.parentId)) {
      throw new McpPlanError(`Widget "${node.id}" names a missing parent "${node.parentId}"`)
    }
  }

  assignDepths(nodes)

  const relations = normalizeRelations(plan.relations, ids)
  const wires = normalizeWires(plan.wires, nodes)

  return { canvasId, origin, nodes, relations, wires }
}

function assignDepths(nodes: WidgetPlanNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const cache = new Map<string, number>()
  const depthOf = (id: string, path: Set<string>): number => {
    const cached = cache.get(id)
    if (cached !== undefined) return cached
    if (path.has(id)) throw new McpPlanError(`The parent links form a loop through "${id}"`)
    const node = byId.get(id)
    if (!node) return 0
    const depth = node.parentId ? depthOf(node.parentId, new Set(path).add(id)) + 1 : 0
    if (depth > MCP_PLAN_LIMITS.maxDepth) {
      throw new McpPlanError(`Parent nesting cannot go deeper than ${MCP_PLAN_LIMITS.maxDepth} levels`)
    }
    cache.set(id, depth)
    return depth
  }
  for (const node of nodes) node.depth = depthOf(node.id, new Set())
}

function normalizeRelations(raw: unknown, ids: Set<string>): WidgetPlanRelation[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new McpPlanError('relations must be a list')
  if (raw.length > MCP_PLAN_LIMITS.maxRelations) {
    throw new McpPlanError(`A plan can contain at most ${MCP_PLAN_LIMITS.maxRelations} relations`)
  }
  return raw.map((rawRelation, index) => {
    const label = `relations[${index}]`
    const relation = record(rawRelation, label)
    const fromId = boundedText(relation.fromId, `${label}.fromId`, 80, true)
    const toId = boundedText(relation.toId, `${label}.toId`, 80, true)
    for (const [key, value] of [['fromId', fromId], ['toId', toId]] as const) {
      if (!ids.has(value)) throw new McpPlanError(`${label}.${key} names a widget "${value}" that is not in this plan`)
    }
    if (fromId === toId) throw new McpPlanError(`${label} links "${fromId}" to itself`)
    const type = boundedText(relation.type, `${label}.type`, 20, true)
    if (!RELATION_TYPES.includes(type as RelationType)) {
      throw new McpPlanError(`${label}.type must be one of: ${RELATION_TYPES.join(', ')}`)
    }
    return { fromId, toId, type: type as RelationType }
  })
}

/** Wires are checked against the live field registry: a value wire may only
 *  read a field the source type publishes and write one the target type marks
 *  settable; a trigger wire may only run a command the target type owns. */
function normalizeWires(raw: unknown, nodes: WidgetPlanNode[]): WidgetPlanWire[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new McpPlanError('wires must be a list')
  if (raw.length > MCP_PLAN_LIMITS.maxWires) {
    throw new McpPlanError(`A plan can contain at most ${MCP_PLAN_LIMITS.maxWires} wires`)
  }
  const typeById = new Map(nodes.map((node) => [node.id, node.type]))

  return raw.map((rawWire, index) => {
    const label = `wires[${index}]`
    const wire = record(rawWire, label)
    const fromId = boundedText(wire.fromId, `${label}.fromId`, 80, true)
    const toId = boundedText(wire.toId, `${label}.toId`, 80, true)
    const fromType = typeById.get(fromId)
    const toType = typeById.get(toId)
    if (!fromType) throw new McpPlanError(`${label}.fromId names a widget "${fromId}" that is not in this plan`)
    if (!toType) throw new McpPlanError(`${label}.toId names a widget "${toId}" that is not in this plan`)
    if (fromId === toId) throw new McpPlanError(`${label} wires "${fromId}" to itself`)

    const fromField = boundedText(wire.fromField, `${label}.fromField`, 60, true)
    const readable = fieldsFor(fromType).map((field) => field.key)
    if (!readable.includes(fromField)) {
      throw new McpPlanError(
        `"${fromField}" is not a readable field on a ${fromType} widget. Readable fields: ${readable.join(', ') || 'none'}`,
      )
    }

    const kind = wire.kind === undefined ? 'value' : boundedText(wire.kind, `${label}.kind`, 10, true)
    if (kind !== 'value' && kind !== 'trigger') {
      throw new McpPlanError(`${label}.kind must be "value" or "trigger"`)
    }

    if (kind === 'value') {
      const toField = boundedText(wire.toField, `${label}.toField`, 60, true)
      const settable = fieldsFor(toType).filter((field) => field.set).map((field) => field.key)
      if (!settable.includes(toField)) {
        throw new McpPlanError(
          `"${toField}" is not a settable field on a ${toType} widget. Settable fields: ${settable.join(', ') || 'none'}`,
        )
      }
      return { fromId, fromField, toId, kind, toField }
    }

    const command = boundedText(wire.command, `${label}.command`, 60, true)
    const commands = commandsFor(toType).map((entry) => entry.key as string)
    if (!commands.includes(command)) {
      throw new McpPlanError(
        `"${command}" is not a command on a ${toType} widget. Commands: ${commands.join(', ') || 'none'}`,
      )
    }
    const edge = wire.edge === undefined ? 'rising' : boundedText(wire.edge, `${label}.edge`, 10, true)
    if (edge !== 'rising' && edge !== 'falling' && edge !== 'change') {
      throw new McpPlanError(`${label}.edge must be "rising", "falling", or "change"`)
    }
    return { fromId, fromField, toId, kind, command, edge }
  })
}

// ---------------------------------------------------------------------------
// Layout — deterministic placement for widgets that arrived without one.
//
// The app's own path settles cards through the thought-plan placer, which needs
// the live store. Server-side there is no store, so plans lay out on the grid by
// depth (column) and order (row). Explicit positions always win.
// ---------------------------------------------------------------------------

const LAYOUT_COLUMN_STEP = GRID_SIZE * 8
const LAYOUT_ROW_STEP = GRID_SIZE * 5

export function layoutWidgetPlan(plan: WidgetPlan): Map<string, Vector2D> {
  const placed = new Map<string, Vector2D>()
  const rowByDepth = new Map<number, number>()
  for (const node of plan.nodes) {
    if (node.position) {
      placed.set(node.id, node.position)
      continue
    }
    const row = rowByDepth.get(node.depth) ?? 0
    rowByDepth.set(node.depth, row + 1)
    placed.set(node.id, {
      x: plan.origin.x + node.depth * LAYOUT_COLUMN_STEP,
      y: plan.origin.y + row * LAYOUT_ROW_STEP,
    })
  }
  return placed
}

// ---------------------------------------------------------------------------
// Server-side apply
// ---------------------------------------------------------------------------

export interface AppliedWidgetPlan {
  document: CloudCanvasDocument
  createdWidgetIds: string[]
  /** plan id -> real board id, so callers can report what became what. */
  idMap: Record<string, string>
}

/**
 * Pure: takes a canvas document and a normalized plan, returns a new document.
 * Unknown top-level fields on the incoming document are preserved by spreading
 * it first — the storage contract forbids this code dropping anything a newer
 * build wrote.
 */
export function applyWidgetPlan(
  document: CloudCanvasDocument,
  plan: WidgetPlan,
  idFactory: IdFactory = defaultIdFactory,
): AppliedWidgetPlan {
  if (document.canvasId !== plan.canvasId) {
    throw new McpPlanError(
      `This plan targets canvas "${plan.canvasId}" but the document is "${document.canvasId}"`,
    )
  }

  const positions = layoutWidgetPlan(plan)
  const idMap: Record<string, string> = {}
  /** A generated id must never land on something already on the canvas: that
   *  would silently replace a card the user owns. Random UUIDs make this
   *  vanishingly unlikely, so treat a hit as a broken id source, not bad luck. */
  const claimId = (): string => {
    const id = idFactory()
    if (id in document.widgets || id in document.relations || id in document.connections) {
      throw new McpPlanError('Generated an id that already exists on this canvas; nothing was written')
    }
    return id
  }
  for (const node of plan.nodes) idMap[node.id] = claimId()

  /** Every plan id was proved to exist during normalization, so a miss here is
   *  a bug in this file rather than bad model input. */
  const boardId = (planId: string): string => {
    const id = idMap[planId]
    if (id === undefined) throw new McpPlanError(`Internal: no board id was created for "${planId}"`)
    return id
  }

  const widgets: Record<string, Widget> = { ...document.widgets }
  for (const node of plan.nodes) {
    const definition = widgetDefinition(node.type)
    const id = boardId(node.id)
    const size: Size = definition.defaultSize
    widgets[id] = {
      id,
      type: node.type as ModuleType,
      title: node.title,
      canvasId: plan.canvasId,
      position: positions.get(node.id) ?? plan.origin,
      size,
      data: node.data,
      metadata: { badges: [] },
    }
  }

  const relations: Record<string, Relation> = { ...document.relations }
  const parentRelations: WidgetPlanRelation[] = plan.nodes
    .filter((node) => node.parentId)
    .map((node) => ({ fromId: node.parentId as string, toId: node.id, type: 'parent' as const }))
  for (const relation of [...parentRelations, ...plan.relations]) {
    const id = claimId()
    relations[id] = {
      id,
      fromId: boardId(relation.fromId),
      toId: boardId(relation.toId),
      type: relation.type,
      isResolved: false,
    }
  }

  const connections: Record<string, Connection> = { ...document.connections }
  for (const wire of plan.wires) {
    const id = claimId()
    connections[id] = {
      id,
      fromId: boardId(wire.fromId),
      fromField: wire.fromField,
      toId: boardId(wire.toId),
      kind: wire.kind,
      enabled: true,
      ...(wire.kind === 'value' ? { toField: wire.toField } : { command: wire.command, edge: wire.edge }),
    } as Connection
  }

  return {
    document: { ...document, widgets, relations, connections },
    createdWidgetIds: plan.nodes.map((node) => boardId(node.id)),
    idMap,
  }
}

// ---------------------------------------------------------------------------
// JSON Schema — what MCP tools declare as their input schema.
//
// widgetPlanContract.test.ts fails if this drifts from the normalizer above.
// ---------------------------------------------------------------------------

export const WIDGET_PLAN_JSON_SCHEMA = {
  type: 'object',
  required: ['widgets'],
  additionalProperties: false,
  properties: {
    canvasId: { type: 'string', maxLength: 160, description: 'Target canvas; defaults to the open one.' },
    origin: {
      type: 'object',
      additionalProperties: false,
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      description: 'World point the layout starts from. Omit to use the canvas default.',
    },
    widgets: {
      type: 'array',
      minItems: 1,
      maxItems: MCP_PLAN_LIMITS.maxWidgets,
      items: {
        type: 'object',
        required: ['id', 'type', 'title'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', maxLength: 80, description: 'Your own id for this widget, unique within the plan.' },
          type: { type: 'string', enum: [...PLANNABLE_WIDGET_TYPES] },
          title: { type: 'string', maxLength: MCP_PLAN_LIMITS.maxTitleLength },
          parentId: { type: ['string', 'null'], maxLength: 80 },
          position: {
            type: 'object',
            additionalProperties: false,
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            description: 'Omit to let Grovepad lay the widget out.',
          },
          content: { type: 'object', description: 'Type-specific fields; see the tool description.' },
        },
      },
    },
    relations: {
      type: 'array',
      maxItems: MCP_PLAN_LIMITS.maxRelations,
      items: {
        type: 'object',
        required: ['fromId', 'toId', 'type'],
        additionalProperties: false,
        properties: {
          fromId: { type: 'string', maxLength: 80 },
          toId: { type: 'string', maxLength: 80 },
          type: { type: 'string', enum: [...RELATION_TYPES] },
        },
      },
    },
    wires: {
      type: 'array',
      maxItems: MCP_PLAN_LIMITS.maxWires,
      items: {
        type: 'object',
        required: ['fromId', 'fromField', 'toId'],
        additionalProperties: false,
        properties: {
          fromId: { type: 'string', maxLength: 80 },
          fromField: { type: 'string', maxLength: 60 },
          toId: { type: 'string', maxLength: 80 },
          kind: { type: 'string', enum: ['value', 'trigger'] },
          toField: { type: 'string', maxLength: 60 },
          command: { type: 'string', maxLength: 60 },
          edge: { type: 'string', enum: ['rising', 'falling', 'change'] },
        },
      },
    },
  },
} as const
