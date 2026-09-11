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
  GlueRestoreEntry,
  Relation,
  RelationType,
  Vector2D,
  Widget,
  WidgetGlue,
  Workspace,
} from '../types/spatial'
import { clampZoom, DOMAIN_PACKS, MODULE_TYPES } from '../types/spatial'
import { AUTOMATION_CORE_SET } from '../widgets/automationCoreCatalog'
import { DELETED_WIDGET_TYPES } from '../widgets/deletedWidgetTypes'
import { currentWidgetType } from '../widgets/renamedWidgetTypes'
import { widgetDefinition } from '../widgets/registry'

const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES)
const TRANSIENT_AUTOMATION_RUN_TYPES = new Set<string>(['http_request', 'webhook_sender', 'widget_creator'])
const DOMAIN_PACK_SET = new Set<string>(DOMAIN_PACKS)
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
  'glues',
  // Legacy widget-grouping records. The grouping feature was replaced by
  // gluing; recognized here only so old payloads' groups are dropped cleanly
  // instead of round-tripping as opaque unknown fields.
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
  unknownGlues: Record<string, Record<string, unknown>>
  rawActivePacks: string[]
}

const EMPTY_SIDECARS: PersistenceSidecars = {
  unknownRelations: {},
  unknownConnections: {},
  unknownGlues: {},
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
    persistenceUnknownGlues: {
      configurable: false,
      enumerable: false,
      writable: false,
      value: sidecars.unknownGlues,
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

/**
 * The `collapsed` name-pill scale state was retired. A board saved while a
 * widget was a pill still carries the flag plus the pill's 200×40 `size`, so
 * restore the dormant full-card geometry instead of leaving a stunted card.
 */
function restoreRetiredPill(widget: Widget & { collapsed?: boolean }): void {
  if (widget.collapsed !== true) return
  delete widget.collapsed
  if (widget.iconified === true) return
  widget.size = widget.expandedSize ?? widgetDefinition(widget.type).defaultSize
  delete widget.expandedSize
}

/**
 * The state a pin interrupted, as loaded from disk. Anything that is not a
 * shape unpinning could act on is dropped: an unpin then falls back to the
 * resting face, which is exactly the old behaviour and never a broken box.
 */
function sanitizePinOrigin(widget: Widget): void {
  const metadata = widget.metadata as unknown as Record<string, unknown> | undefined
  if (!metadata || !('pinnedFrom' in metadata)) return
  const from = metadata.pinnedFrom
  const valid =
    isRecord(from) &&
    ((from.kind === 'rest') ||
      (from.kind === 'icon' &&
        isFiniteNumber(from.width) &&
        isFiniteNumber(from.height) &&
        from.width > 0 &&
        from.height > 0))
  // A memory without a pin to belong to is stale bookkeeping, not state.
  if (!valid || metadata.pinned !== true) delete metadata.pinnedFrom
}

/** One-time compatibility normalization for evolved widget data contracts. */
function normalizeWidgetData(widget: Widget): Widget {
  const persistentWidget = { ...widget, metadata: { ...widget.metadata } }
  delete persistentWidget.isHydrating
  restoreRetiredPill(persistentWidget)
  sanitizePinOrigin(persistentWidget)

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
    type: 'text',
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
    (value.parentCanvasId === null || typeof value.parentCanvasId === 'string') &&
    (value.shared === undefined || typeof value.shared === 'boolean') &&
    (value.gridIntensity === undefined || (isFiniteNumber(value.gridIntensity) && value.gridIntensity >= 0 && value.gridIntensity <= 100)) &&
    (value.linksVisible === undefined || typeof value.linksVisible === 'boolean') &&
    (value.relationStrict === undefined || typeof value.relationStrict === 'boolean')
  )
}

function parseGlueEnvelope(
  value: unknown,
  widgets: Record<string, Widget>,
): { source: Record<string, unknown>; widgetIds: string[] } | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !Array.isArray(value.widgetIds)) return null
  const widgetIds = value.widgetIds.filter(
    (id): id is string => typeof id === 'string' && Boolean(widgets[id]),
  )
  if (widgetIds.length < 2) return null
  return { source: value, widgetIds }
}

/**
 * The pre-collapse state map a folded cluster carries. Only entries for members
 * the cluster still has are kept, and every field must be a finite number, so a
 * corrupt or stale restore map can never place a widget at NaN on expand.
 */
function sanitizeGlueRestore(
  value: unknown,
  widgetIds: readonly string[],
): Record<string, GlueRestoreEntry> | undefined {
  if (!isRecord(value)) return undefined
  const members = new Set(widgetIds)
  const restore: Record<string, GlueRestoreEntry> = {}
  for (const [id, entry] of Object.entries(value)) {
    if (!members.has(id) || !isRecord(entry)) continue
    const { x, y, width, height } = entry
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue
    if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) continue
    restore[id] = { x, y, width, height, iconified: entry.iconified === true }
  }
  return Object.keys(restore).length > 0 ? restore : undefined
}

function sanitizeGlue(value: unknown, widgets: Record<string, Widget>): WidgetGlue | null {
  const envelope = parseGlueEnvelope(value, widgets)
  if (!envelope) return null
  const rawName = envelope.source.name
  const name =
    typeof rawName === 'string' && rawName.trim() ? rawName.replace(/\s+/g, ' ').trim().slice(0, 60) : undefined
  const restore = sanitizeGlueRestore(envelope.source.restore, envelope.widgetIds)
  // A cluster is only "collapsed" if it also carries the map that can undo the
  // fold — otherwise expanding it would have nothing to restore to.
  const collapsed = envelope.source.collapsed === true && Boolean(restore)
  // The fold anchor only means anything while the fold it describes is in
  // effect, and must be finite so an expand can never shift members to NaN.
  const rawFoldedAt = envelope.source.foldedAt
  const foldedAt =
    collapsed && isRecord(rawFoldedAt) && isFiniteNumber(rawFoldedAt.x) && isFiniteNumber(rawFoldedAt.y)
      ? { x: rawFoldedAt.x, y: rawFoldedAt.y }
      : undefined
  return {
    ...envelope.source,
    id: envelope.source.id,
    widgetIds: envelope.widgetIds,
    ...(name ? { name } : {}),
    ...(collapsed ? { collapsed: true } : { collapsed: undefined }),
    ...(collapsed && restore ? { restore } : { restore: undefined }),
    ...(foldedAt ? { foldedAt } : { foldedAt: undefined }),
  } as unknown as WidgetGlue
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

function parseGlues(raw: unknown, widgets: Record<string, Widget>): ParsedRecords<WidgetGlue> {
  const known: Record<string, WidgetGlue> = {}
  const unknown: Record<string, Record<string, unknown>> = {}
  if (isRecord(raw)) {
    for (const [id, glue] of Object.entries(raw)) {
      const envelope = parseGlueEnvelope(glue, widgets)
      if (!envelope || envelope.source.id !== id) continue
      const sanitized = sanitizeGlue(glue, widgets)
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

/**
 * The id a v1 board's single canvas becomes.
 *
 * This used to be the literal `'canvas-origin'`, matching the seed id every
 * fresh install also used — so every account in the product shared one canvas
 * id. Canvas ids are the primary key of `canvas_collaborations` and the folder
 * name media is stored under, which turned a cosmetic constant into a
 * cross-tenant namespace collision. Minted per migration now, like every other
 * canvas id.
 */
export const LEGACY_SHARED_ROOT_CANVAS_ID = 'canvas-origin'
const newCanvasId = (): string => crypto.randomUUID()

/**
 * Move a board off the shared `canvas-origin` id, once, on load.
 *
 * Boards saved before ids were minted per install all name their root canvas
 * the same thing. That id is the primary key of `canvas_collaborations` and the
 * folder media is filed under, so leaving it in place means one account can
 * register the row every other account's default board resolves to. Rewriting
 * it locally is what makes the collision go away for boards already on disk;
 * new boards never have it.
 *
 * The board is only ever pushed to the cloud under the new id, so the effect of
 * this is a fresh cloud document rather than a mutation of a shared one.
 */
export function remapLegacyRootCanvasId(
  board: HydratedPersistedBoard,
  mintId: () => string = newCanvasId,
): HydratedPersistedBoard {
  const from = LEGACY_SHARED_ROOT_CANVAS_ID
  if (!board.canvases[from]) return board
  const to = mintId()
  const swap = (id: string | null | undefined): string | null | undefined => (id === from ? to : id)

  const canvases: Record<string, CanvasMeta> = {}
  for (const [id, canvas] of Object.entries(board.canvases)) {
    const nextId = id === from ? to : id
    canvases[nextId] = {
      ...canvas,
      id: nextId,
      parentCanvasId: swap(canvas.parentCanvasId) ?? null,
    }
  }

  const workspaces: Record<string, Workspace> = {}
  for (const [id, workspace] of Object.entries(board.workspaces)) {
    workspaces[id] = { ...workspace, rootCanvasId: swap(workspace.rootCanvasId) as string }
  }

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(board.widgets)) {
    const next: Widget = { ...widget, canvasId: swap(widget.canvasId) as string }
    // A canvas-node card names the canvas it opens; missing it here would leave
    // a portal pointing at an id nothing answers to.
    const data = next.data as unknown as Record<string, unknown>
    if (next.type === 'canvas_node' && data?.canvasId === from) {
      next.data = { ...data, canvasId: to } as Widget['data']
    }
    widgets[id] = next
  }

  const canvasViews = board.canvasViews
    ? Object.fromEntries(
        Object.entries(board.canvasViews).map(([id, view]) => [id === from ? to : id, view]),
      )
    : board.canvasViews

  return Object.assign(Object.create(Object.getPrototypeOf(board) as object), board, {
    canvases,
    workspaces,
    widgets,
    canvasViews,
    activeCanvasId: swap(board.activeCanvasId),
  }) as HydratedPersistedBoard
}

/** Wrap a v1 flat board in a default workspace and root canvas. */
export function migrateLegacyBoard(parsed: unknown): HydratedPersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null

  const rootCanvasId = newCanvasId()
  const widgets: Record<string, Widget> = {}
  for (const [id, raw] of Object.entries(parsed.widgets)) {
    if (!hasValidWidgetEnvelope(raw, false) || raw.id !== id) continue
    // A deleted card is dropped outright rather than hydrated as a placeholder,
    // so it cannot reappear on a canvas that used to hold it. Relations, wires,
    // and glue that named it fall away with it: each of those parsers validates
    // against the widgets that survived this loop.
    if (DELETED_WIDGET_TYPES.has(raw.type as string)) continue
    // A renamed card is still fully known, just under an old name — rewrite it
    // to the live name before anything else looks at `type`, or it hydrates as
    // an opaque, locked placeholder like a genuinely unrecognised future type.
    const widget = { ...raw, type: currentWidgetType(raw.type as string) }
    const migratedWidget = { ...widget, canvasId: rootCanvasId }
    widgets[id] = MODULE_TYPE_SET.has(widget.type as string)
      ? normalizeWidgetData(migratedWidget as unknown as Widget)
      : createOpaqueWidget(migratedWidget)
  }

  const workspaces: Record<string, Workspace> = {
    [MIGRATED_WORKSPACE_ID]: {
      id: MIGRATED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId: rootCanvasId,
      createdAt: Date.now(),
    },
  }
  const canvases: Record<string, CanvasMeta> = {
    [rootCanvasId]: {
      id: rootCanvasId,
      name: 'Origin',
      workspaceId: MIGRATED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
  const relations = parseRelations(parsed.relations, widgets)
  const connections = parseConnections(parsed.connections, widgets)
  const glues = parseGlues(parsed.glues, widgets)
  const packs = parsePacks(parsed.activePacks)

  return attachPersistenceSidecars({
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces,
    canvases,
    widgets,
    relations: relations.known,
    connections: connections.known,
    glues: glues.known,
    activePacks: packs.known,
    activeWorkspaceId: MIGRATED_WORKSPACE_ID,
    activeCanvasId: rootCanvasId,
    canvasViews: {},
  }, parsed, {
    unknownRelations: relations.unknown,
    unknownConnections: connections.unknown,
    unknownGlues: glues.unknown,
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
  for (const [id, raw] of Object.entries(parsed.widgets)) {
    if (!hasValidWidgetEnvelope(raw, true) || raw.id !== id) continue
    // See migrateLegacyBoard: deleted cards are dropped, never rehydrated.
    if (DELETED_WIDGET_TYPES.has(raw.type as string)) continue
    // See migrateLegacyBoard: a renamed card is rewritten to its live name
    // before validity is checked, so it never falls into the opaque path.
    const widget: Record<string, unknown> = { ...raw, type: currentWidgetType(raw.type as string) }
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
  const glues = parseGlues(parsed.glues, widgets)
  const packs = parsePacks(parsed.activePacks)

  return attachPersistenceSidecars({
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces,
    canvases,
    widgets,
    relations: relations.known,
    connections: connections.known,
    glues: glues.known,
    activePacks: packs.known,
    activeWorkspaceId,
    activeCanvasId,
    canvasViews,
  }, parsed, {
    unknownRelations: relations.unknown,
    unknownConnections: connections.unknown,
    unknownGlues: glues.unknown,
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

function retainOpaqueGlues(
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
      // The stashed source is the newer client's record verbatim, but its
      // envelope goes stale as soon as an import or merge relocates the
      // placeholder: `{ ...widget, id, canvasId }` copies the symbol along with
      // the old ids. Re-stamp the two fields the reader owns, so the record can
      // never disagree with its own map key or name a canvas that is not there.
      return [
        id,
        opaqueSource
          ? { ...opaqueSource, id, canvasId: widget.canvasId } as unknown as Widget
          : normalizeWidgetData(widget),
      ]
    }),
  )
  const unknownRelations = retainOpaqueEdges(state.persistenceUnknownRelations, state.widgets)
  const unknownConnections = retainOpaqueEdges(state.persistenceUnknownConnections, state.widgets)
  const unknownGlues = retainOpaqueGlues(state.persistenceUnknownGlues, state.widgets)
  return {
    ...(state.persistenceUnknownFields ?? {}),
    format: PERSISTED_BOARD_FORMAT,
    v: PERSISTED_BOARD_VERSION,
    workspaces: state.workspaces,
    canvases: state.canvases,
    widgets,
    relations: { ...unknownRelations, ...state.relations } as unknown as Record<string, Relation>,
    connections: { ...unknownConnections, ...state.connections } as unknown as Record<string, Connection>,
    glues: { ...unknownGlues, ...state.glues } as unknown as Record<string, WidgetGlue>,
    activePacks: serializePacks(state.activePacks, state.persistenceRawActivePacks),
  }
}
