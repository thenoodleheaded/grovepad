import type { Connection } from '../types/circuit'
import { isValidConnectionShape } from '../types/circuit'
import {
  PERSISTED_BOARD_FORMAT,
  PERSISTED_BOARD_VERSION,
  type HydratedPersistedBoard,
  type PersistedBoard,
  type PersistedBoardState,
} from '../types/persistence'
import type {
  CanvasMeta,
  DomainPack,
  Relation,
  RelationType,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from '../types/spatial'
import { clampZoom, DOMAIN_PACKS, GROUP_COLORS, MODULE_TYPES } from '../types/spatial'
import { AUTOMATION_CORE_SET } from '../widgets/automationCoreCatalog'

const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES)
const TRANSIENT_AUTOMATION_RUN_TYPES = new Set<string>(['http_request', 'webhook_sender', 'widget_creator'])
const DOMAIN_PACK_SET = new Set<string>(DOMAIN_PACKS)
const GROUP_COLOR_SET = new Set<string>(GROUP_COLORS)
const RELATION_TYPES: readonly RelationType[] = [
  'parent',
  'co-parent',
  'cousin',
  'blocker',
  'conflict',
]
const RELATION_TYPE_SET = new Set<string>(RELATION_TYPES)
const OPAQUE_WIDGET_SOURCE = Symbol.for('grovepad.persistence.opaque-widget-source')
const KNOWN_BOARD_FIELDS = new Set([
  'format',
  'v',
  'workspaces',
  'canvases',
  'widgets',
  'relations',
  'connections',
  'groups',
  'activePacks',
  'activeWorkspaceId',
  'activeCanvasId',
  'canvasViews',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getOpaqueWidgetSource(widget: Widget): Record<string, unknown> | null {
  const source = (widget as Widget & { [OPAQUE_WIDGET_SOURCE]?: unknown })[OPAQUE_WIDGET_SOURCE]
  return isRecord(source) ? source : null
}

/** The newer module type represented by a safe placeholder, if any. */
export function getOpaqueWidgetType(widget: Widget): string | null {
  const source = getOpaqueWidgetSource(widget)
  return source && typeof source.type === 'string' ? source.type : null
}

function collectUnknownBoardFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !KNOWN_BOARD_FIELDS.has(key)),
  )
}

interface PersistenceSidecars {
  unknownRelations: Record<string, Record<string, unknown>>
  unknownConnections: Record<string, Record<string, unknown>>
  unknownGroups: Record<string, Record<string, unknown>>
  rawActivePacks: string[]
}

const EMPTY_SIDECARS: PersistenceSidecars = {
  unknownRelations: {},
  unknownConnections: {},
  unknownGroups: {},
  rawActivePacks: [],
}

function attachPersistenceSidecars(
  board: HydratedPersistedBoard,
  source: Record<string, unknown>,
  sidecars: PersistenceSidecars = EMPTY_SIDECARS,
): HydratedPersistedBoard {
  Object.defineProperties(board, {
    persistenceUnknownFields: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: collectUnknownBoardFields(source),
    },
    persistenceUnknownRelations: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: sidecars.unknownRelations,
    },
    persistenceUnknownConnections: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: sidecars.unknownConnections,
    },
    persistenceUnknownGroups: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: sidecars.unknownGroups,
    },
    persistenceRawActivePacks: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: sidecars.rawActivePacks,
    },
  })
  return board
}

/** Detect the one incompatible case that must block all writes in an old client. */
export function getFuturePersistedBoardVersion(value: unknown): number | null {
  if (!isRecord(value)) return null
  if (value.format !== PERSISTED_BOARD_FORMAT) return null
  if (typeof value.v !== 'number' || !Number.isInteger(value.v)) return null
  return value.v > PERSISTED_BOARD_VERSION ? value.v : null
}

export function isPersistedBoardFromNewerVersion(value: unknown): boolean {
  return getFuturePersistedBoardVersion(value) !== null
}

export class FuturePersistedBoardVersionError extends Error {
  readonly foundVersion: number

  constructor(foundVersion: number) {
    super(`Board version ${foundVersion} requires a newer Grovepad`)
    this.name = 'FuturePersistedBoardVersionError'
    this.foundVersion = foundVersion
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

/** One-time compatibility normalization for evolved widget data contracts. */
function normalizeWidgetData(widget: Widget): Widget {
  const persistentWidget = { ...widget }
  delete persistentWidget.isHydrating

  if (persistentWidget.type === 'ai_generator') {
    const data = persistentWidget.data as unknown as Record<string, unknown>
    if (data.status === 'generating') {
      return { ...persistentWidget, data: { ...data, status: 'idle' } as Widget['data'] }
    }
  }
  if (persistentWidget.type === 'secret_reference') {
    const data = persistentWidget.data as unknown as Record<string, unknown>
    return {
      ...persistentWidget,
      data: {
        ...data,
        input: '',
        output: '',
        config: '{}',
        enabled: false,
        running: false,
        lastError: 'Secret material was removed. Protected secret storage is not available in this beta.',
      } as Widget['data'],
    }
  }
  if (AUTOMATION_CORE_SET.has(persistentWidget.type) && TRANSIENT_AUTOMATION_RUN_TYPES.has(persistentWidget.type)) {
    const data = persistentWidget.data as unknown as Record<string, unknown>
    if (data.running === true) {
      return {
        ...persistentWidget,
        data: {
          ...data,
          running: false,
          lastError: 'Previous run was interrupted. Review the input and run again.',
        } as Widget['data'],
      }
    }
  }
  if (persistentWidget.type !== 'bullets') return persistentWidget
  const data = persistentWidget.data as unknown as Record<string, unknown>
  const rawItems = Array.isArray(data.items)
    ? data.items as unknown[]
    : []
  const items = rawItems.flatMap((value, index) => {
    if (typeof value === 'string') {
      return [{ id: `${persistentWidget.id}:bullet:${index}`, text: value }]
    }
    if (isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string') {
      return [{ ...value, id: value.id, text: value.text }]
    }
    return []
  })
  return { ...persistentWidget, data: { ...data, items } as Widget['data'] }
}

/** Base spatial envelope shared by known and future widget module types. */
function hasValidWidgetEnvelope(
  value: unknown,
  requireCanvasId: boolean,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    (!requireCanvasId || typeof value.canvasId === 'string') &&
    isVector(value.position) &&
    isRecord(value.size) &&
    isFiniteNumber(value.size.width) &&
    isFiniteNumber(value.size.height) &&
    isRecord(value.data) &&
    isRecord(value.metadata) &&
    Array.isArray(value.metadata.badges)
  )
}

/** Widget shape check. `requireCanvasId` is false when migrating v1 data. */
function isValidWidget(value: unknown, requireCanvasId: boolean): value is Widget {
  return hasValidWidgetEnvelope(value, requireCanvasId) && MODULE_TYPE_SET.has(value.type as string)
}

function createOpaqueWidget(value: Record<string, unknown>): Widget {
  const placeholder: Record<PropertyKey, unknown> = {
    ...value,
    type: 'notes',
    data: { text: '' },
    metadata: { ...(value.metadata as Record<string, unknown>), locked: true },
    [OPAQUE_WIDGET_SOURCE]: value,
  }
  delete placeholder.isHydrating
  return placeholder as unknown as Widget
}

function hasValidRelationEnvelope(
  value: unknown,
  widgets: Record<string, Widget>,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.fromId === 'string' &&
    typeof value.toId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.isResolved === 'boolean' &&
    Boolean(widgets[value.fromId]) &&
    Boolean(widgets[value.toId])
  )
}

function isValidRelation(value: unknown, widgets: Record<string, Widget>): value is Relation {
  return hasValidRelationEnvelope(value, widgets) && RELATION_TYPE_SET.has(value.type as string)
}

function isValidWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.rootCanvasId === 'string' &&
    isFiniteNumber(value.createdAt)
  )
}

function isValidCanvas(value: unknown): value is CanvasMeta {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.workspaceId === 'string' &&
    (value.parentCanvasId === null || typeof value.parentCanvasId === 'string')
  )
}

function parseGroupEnvelope(
  value: unknown,
  widgets: Record<string, Widget>,
): { source: Record<string, unknown>; widgetIds: string[] } | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.color !== 'string' ||
    !Array.isArray(value.widgetIds)
  ) {
    return null
  }
  const widgetIds = value.widgetIds.filter(
    (id): id is string => typeof id === 'string' && Boolean(widgets[id]),
  )
  if (widgetIds.length < 2) return null
  return { source: value, widgetIds }
}

function sanitizeGroup(value: unknown, widgets: Record<string, Widget>): WidgetGroup | null {
  const envelope = parseGroupEnvelope(value, widgets)
  if (!envelope || !GROUP_COLOR_SET.has(envelope.source.color as string)) return null
  return {
    ...envelope.source,
    id: envelope.source.id,
    label: envelope.source.label,
    widgetIds: envelope.widgetIds,
    color: envelope.source.color as WidgetGroup['color'],
  } as unknown as WidgetGroup
}

interface ParsedRecords<T> {
  known: Record<string, T>
  unknown: Record<string, Record<string, unknown>>
}

function parseRelations(
  raw: unknown,
  widgets: Record<string, Widget>,
): ParsedRecords<Relation> {
  const known: Record<string, Relation> = {}
  const unknown: Record<string, Record<string, unknown>> = {}
  if (isRecord(raw)) {
    for (const [id, relation] of Object.entries(raw)) {
      if (!hasValidRelationEnvelope(relation, widgets) || relation.id !== id) continue
      if (isValidRelation(relation, widgets)) known[id] = relation
      else unknown[id] = relation
    }
  }
  return { known, unknown }
}

function hasValidConnectionEnvelope(
  value: unknown,
  widgets: Record<string, Widget>,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' ||
    typeof value.fromId !== 'string' ||
    typeof value.fromField !== 'string' ||
    typeof value.toId !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    !widgets[value.fromId] ||
    !widgets[value.toId]
  ) {
    return false
  }
  if (value.kind === 'value') {
    if (typeof value.toField !== 'string') return false
    if (value.transform !== undefined) {
      if (!isRecord(value.transform) || typeof value.transform.op !== 'string') return false
    }
  }
  if (value.kind === 'trigger') {
    if (typeof value.command !== 'string' || typeof value.edge !== 'string') return false
  }
  return true
}

function parseConnections(
  raw: unknown,
  widgets: Record<string, Widget>,
): ParsedRecords<Connection> {
  const known: Record<string, Connection> = {}
  const unknown: Record<string, Record<string, unknown>> = {}
  if (isRecord(raw)) {
    for (const [id, connection] of Object.entries(raw)) {
      if (!hasValidConnectionEnvelope(connection, widgets) || connection.id !== id) continue
      if (isValidConnectionShape(connection)) known[id] = connection
      else unknown[id] = connection
    }
  }
  return { known, unknown }
}

function parseGroups(raw: unknown, widgets: Record<string, Widget>): ParsedRecords<WidgetGroup> {
  const known: Record<string, WidgetGroup> = {}
  const unknown: Record<string, Record<string, unknown>> = {}
  if (isRecord(raw)) {
    for (const [id, group] of Object.entries(raw)) {
      const envelope = parseGroupEnvelope(group, widgets)
      if (!envelope || envelope.source.id !== id) continue
      const sanitized = sanitizeGroup(group, widgets)
      if (sanitized) known[id] = sanitized
      else unknown[id] = { ...envelope.source, widgetIds: envelope.widgetIds }
    }
  }
  return { known, unknown }
}

function parsePacks(raw: unknown): { known: DomainPack[]; rawStrings: string[] } {
  const rawStrings = Array.isArray(raw)
    ? raw.filter((pack): pack is string => typeof pack === 'string')
    : []
  return {
    known: rawStrings.filter((pack): pack is DomainPack => DOMAIN_PACK_SET.has(pack)),
    rawStrings,
  }
}

const MIGRATED_WORKSPACE_ID = 'ws-default'
const MIGRATED_ROOT_CANVAS_ID = 'canvas-origin'

/** Wrap a v1 flat board in a default workspace and root canvas. */
export function migrateLegacyBoard(parsed: unknown): HydratedPersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(parsed.widgets)) {
    if (!hasValidWidgetEnvelope(widget, false) || widget.id !== id) continue
    const migratedWidget = { ...widget, canvasId: MIGRATED_ROOT_CANVAS_ID }
    widgets[id] = MODULE_TYPE_SET.has(widget.type as string)
      ? normalizeWidgetData(migratedWidget as unknown as Widget)
      : createOpaqueWidget(migratedWidget)
  }

  const workspaces: Record<string, Workspace> = {
    [MIGRATED_WORKSPACE_ID]: {
      id: MIGRATED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId: MIGRATED_ROOT_CANVAS_ID,
      createdAt: Date.now(),
    },
  }
  const canvases: Record<string, CanvasMeta> = {
    [MIGRATED_ROOT_CANVAS_ID]: {
      id: MIGRATED_ROOT_CANVAS_ID,
      name: 'Origin',
      workspaceId: MIGRATED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
  const relations = parseRelations(parsed.relations, widgets)
  const connections = parseConnections(parsed.connections, widgets)
  const groups = parseGroups(parsed.groups, widgets)
  const packs = parsePacks(parsed.activePacks)

  return attachPersistenceSidecars({
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces,
    canvases,
    widgets,
    relations: relations.known,
    connections: connections.known,
    groups: groups.known,
    activePacks: packs.known,
    activeWorkspaceId: MIGRATED_WORKSPACE_ID,
    activeCanvasId: MIGRATED_ROOT_CANVAS_ID,
    canvasViews: {},
  }, parsed, {
    unknownRelations: relations.unknown,
    unknownConnections: connections.unknown,
    unknownGroups: groups.unknown,
    rawActivePacks: packs.rawStrings,
  })
}

/** Validate and normalize an arbitrary v2 board payload. */
export function parsePersistedBoard(parsed: unknown): HydratedPersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null
  if (parsed.format !== undefined && parsed.format !== PERSISTED_BOARD_FORMAT) return null
  if (parsed.v !== undefined && parsed.v !== PERSISTED_BOARD_VERSION) return null
  if (!isRecord(parsed.workspaces) || !isRecord(parsed.canvases)) return null

  const workspaces: Record<string, Workspace> = {}
  for (const [id, workspace] of Object.entries(parsed.workspaces)) {
    if (isValidWorkspace(workspace) && workspace.id === id) workspaces[id] = workspace
  }

  const canvases: Record<string, CanvasMeta> = {}
  for (const [id, canvas] of Object.entries(parsed.canvases)) {
    if (isValidCanvas(canvas) && canvas.id === id && workspaces[canvas.workspaceId]) {
      canvases[id] = canvas
    }
  }
  for (const canvas of Object.values(canvases)) {
    if (canvas.parentCanvasId !== null && !canvases[canvas.parentCanvasId]) {
      delete canvases[canvas.id]
    }
  }
  for (const workspace of Object.values(workspaces)) {
    if (!canvases[workspace.rootCanvasId]) delete workspaces[workspace.id]
  }
  for (const canvas of Object.values(canvases)) {
    if (!workspaces[canvas.workspaceId]) delete canvases[canvas.id]
  }
  if (Object.keys(workspaces).length === 0) return null

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(parsed.widgets)) {
    if (!hasValidWidgetEnvelope(widget, true) || widget.id !== id) continue
    if (typeof widget.canvasId !== 'string' || !canvases[widget.canvasId]) continue
    widgets[id] = isValidWidget(widget, true)
      ? normalizeWidgetData(widget)
      : createOpaqueWidget(widget)
  }

  const firstWorkspace = Object.values(workspaces)[0]!
  const activeWorkspaceId =
    typeof parsed.activeWorkspaceId === 'string' && workspaces[parsed.activeWorkspaceId]
      ? parsed.activeWorkspaceId
      : firstWorkspace.id
  const activeCanvasId =
    typeof parsed.activeCanvasId === 'string' &&
    canvases[parsed.activeCanvasId]?.workspaceId === activeWorkspaceId
      ? parsed.activeCanvasId
      : workspaces[activeWorkspaceId]!.rootCanvasId

  const canvasViews: HydratedPersistedBoard['canvasViews'] = {}
  if (isRecord(parsed.canvasViews)) {
    for (const [canvasId, view] of Object.entries(parsed.canvasViews)) {
      if (!canvases[canvasId] || !isRecord(view)) continue
      if (!isVector(view.pan) || !isFiniteNumber(view.zoom)) continue
      canvasViews[canvasId] = { ...view, pan: view.pan, zoom: clampZoom(view.zoom) }
    }
  }
  const relations = parseRelations(parsed.relations, widgets)
  const connections = parseConnections(parsed.connections, widgets)
  const groups = parseGroups(parsed.groups, widgets)
  const packs = parsePacks(parsed.activePacks)

  return attachPersistenceSidecars({
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces,
    canvases,
    widgets,
    relations: relations.known,
    connections: connections.known,
    groups: groups.known,
    activePacks: packs.known,
    activeWorkspaceId,
    activeCanvasId,
    canvasViews,
  }, parsed, {
    unknownRelations: relations.unknown,
    unknownConnections: connections.unknown,
    unknownGroups: groups.unknown,
    rawActivePacks: packs.rawStrings,
  })
}

function retainOpaqueEdges(
  records: Record<string, Record<string, unknown>> | undefined,
  widgets: Record<string, Widget>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(records ?? {}).filter(([, value]) =>
      typeof value.fromId === 'string' &&
      typeof value.toId === 'string' &&
      Boolean(widgets[value.fromId]) &&
      Boolean(widgets[value.toId]),
    ),
  )
}

function retainOpaqueGroups(
  records: Record<string, Record<string, unknown>> | undefined,
  widgets: Record<string, Widget>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(records ?? {}).flatMap(([id, value]) => {
      if (!Array.isArray(value.widgetIds)) return []
      const widgetIds = value.widgetIds.filter(
        (widgetId): widgetId is string => typeof widgetId === 'string' && Boolean(widgets[widgetId]),
      )
      return widgetIds.length >= 2 ? [[id, { ...value, widgetIds }]] : []
    }),
  )
}

function serializePacks(activePacks: DomainPack[], rawPacks: string[] | undefined): DomainPack[] {
  const active = new Set<string>(activePacks)
  const seen = new Set<string>()
  const serialized: string[] = []
  for (const pack of rawPacks ?? []) {
    if (!DOMAIN_PACK_SET.has(pack)) {
      serialized.push(pack)
      continue
    }
    if (active.has(pack) && !seen.has(pack)) {
      serialized.push(pack)
      seen.add(pack)
    }
  }
  for (const pack of activePacks) {
    if (!seen.has(pack)) serialized.push(pack)
  }
  return serialized as DomainPack[]
}

/**
 * Canonical write boundary for every board transport. Runtime-only widget
 * state is normalized here so IndexedDB, cloud, and packaged documents cannot
 * accidentally acquire it from the Zustand store.
 */
export function serializePersistedBoard(state: PersistedBoardState): PersistedBoard {
  const widgets = Object.fromEntries(
    Object.entries(state.widgets).map(([id, widget]) => {
      const opaqueSource = getOpaqueWidgetSource(widget)
      return [id, opaqueSource ? opaqueSource as unknown as Widget : normalizeWidgetData(widget)]
    }),
  )
  const unknownRelations = retainOpaqueEdges(state.persistenceUnknownRelations, state.widgets)
  const unknownConnections = retainOpaqueEdges(state.persistenceUnknownConnections, state.widgets)
  const unknownGroups = retainOpaqueGroups(state.persistenceUnknownGroups, state.widgets)
  return {
    ...(state.persistenceUnknownFields ?? {}),
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces: state.workspaces,
    canvases: state.canvases,
    widgets,
    relations: { ...unknownRelations, ...state.relations } as unknown as Record<string, Relation>,
    connections: { ...unknownConnections, ...state.connections } as unknown as Record<string, Connection>,
    groups: { ...unknownGroups, ...state.groups } as unknown as Record<string, WidgetGroup>,
    activePacks: serializePacks(state.activePacks, state.persistenceRawActivePacks),
  }
}
