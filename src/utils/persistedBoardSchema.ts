import type { Connection } from '../types/circuit'
import { isValidConnectionShape } from '../types/circuit'
import type { PersistedBoard } from '../types/persistence'
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

const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

/** One-time compatibility normalization for evolved widget data contracts. */
function normalizeWidgetData(widget: Widget): Widget {
  if (widget.type === 'ai_generator') {
    const data = widget.data as unknown as Record<string, unknown>
    if (data.status === 'generating') {
      return { ...widget, data: { ...data, status: 'idle' } as Widget['data'] }
    }
  }
  if (widget.type !== 'bullets') return widget
  const data = widget.data as unknown as Record<string, unknown>
  const rawItems = Array.isArray(data.items)
    ? data.items as unknown[]
    : []
  const items = rawItems.flatMap((value, index) => {
    if (typeof value === 'string') {
      return [{ id: `${widget.id}:bullet:${index}`, text: value }]
    }
    if (isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string') {
      return [{ id: value.id, text: value.text }]
    }
    return []
  })
  return { ...widget, data: { items } }
}

/** Widget shape check. `requireCanvasId` is false when migrating v1 data. */
function isValidWidget(value: unknown, requireCanvasId: boolean): value is Widget {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    MODULE_TYPE_SET.has(value.type) &&
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

function isValidRelation(value: unknown, widgets: Record<string, Widget>): value is Relation {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.fromId === 'string' &&
    typeof value.toId === 'string' &&
    typeof value.type === 'string' &&
    RELATION_TYPE_SET.has(value.type) &&
    typeof value.isResolved === 'boolean' &&
    Boolean(widgets[value.fromId]) &&
    Boolean(widgets[value.toId])
  )
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

function sanitizeGroup(value: unknown, widgets: Record<string, Widget>): WidgetGroup | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.color !== 'string' ||
    !GROUP_COLOR_SET.has(value.color) ||
    !Array.isArray(value.widgetIds)
  ) {
    return null
  }
  const widgetIds = value.widgetIds.filter(
    (id): id is string => typeof id === 'string' && Boolean(widgets[id]),
  )
  if (widgetIds.length < 2) return null
  return { id: value.id, label: value.label, widgetIds, color: value.color as WidgetGroup['color'] }
}

function parseRelations(
  raw: unknown,
  widgets: Record<string, Widget>,
): Record<string, Relation> {
  const relations: Record<string, Relation> = {}
  if (isRecord(raw)) {
    for (const [id, relation] of Object.entries(raw)) {
      if (isValidRelation(relation, widgets) && relation.id === id) relations[id] = relation
    }
  }
  return relations
}

function parseConnections(
  raw: unknown,
  widgets: Record<string, Widget>,
): Record<string, Connection> {
  const connections: Record<string, Connection> = {}
  if (isRecord(raw)) {
    for (const [id, connection] of Object.entries(raw)) {
      if (
        isValidConnectionShape(connection) &&
        connection.id === id &&
        Boolean(widgets[connection.fromId]) &&
        Boolean(widgets[connection.toId])
      ) {
        connections[id] = connection
      }
    }
  }
  return connections
}

function parseGroups(raw: unknown, widgets: Record<string, Widget>): Record<string, WidgetGroup> {
  const groups: Record<string, WidgetGroup> = {}
  if (isRecord(raw)) {
    for (const [id, group] of Object.entries(raw)) {
      const sanitized = sanitizeGroup(group, widgets)
      if (sanitized && sanitized.id === id) groups[id] = sanitized
    }
  }
  return groups
}

function parsePacks(raw: unknown): DomainPack[] {
  return Array.isArray(raw)
    ? raw.filter((pack): pack is DomainPack => typeof pack === 'string' && DOMAIN_PACK_SET.has(pack))
    : []
}

const MIGRATED_WORKSPACE_ID = 'ws-default'
const MIGRATED_ROOT_CANVAS_ID = 'canvas-origin'

/** Wrap a v1 flat board in a default workspace and root canvas. */
export function migrateLegacyBoard(parsed: unknown): PersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(parsed.widgets)) {
    if (isValidWidget(widget, false) && widget.id === id) {
      widgets[id] = normalizeWidgetData({ ...widget, canvasId: MIGRATED_ROOT_CANVAS_ID })
    }
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

  return {
    workspaces,
    canvases,
    widgets,
    relations: parseRelations(parsed.relations, widgets),
    connections: {},
    groups: parseGroups(parsed.groups, widgets),
    activePacks: parsePacks(parsed.activePacks),
    activeWorkspaceId: MIGRATED_WORKSPACE_ID,
    activeCanvasId: MIGRATED_ROOT_CANVAS_ID,
    canvasViews: {},
  }
}

/** Validate and normalize an arbitrary v2 board payload. */
export function parsePersistedBoard(parsed: unknown): PersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null
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
    if (isValidWidget(widget, true) && widget.id === id && canvases[widget.canvasId]) {
      widgets[id] = normalizeWidgetData(widget)
    }
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

  const canvasViews: PersistedBoard['canvasViews'] = {}
  if (isRecord(parsed.canvasViews)) {
    for (const [canvasId, view] of Object.entries(parsed.canvasViews)) {
      if (!canvases[canvasId] || !isRecord(view)) continue
      if (!isVector(view.pan) || !isFiniteNumber(view.zoom)) continue
      canvasViews[canvasId] = { pan: view.pan, zoom: clampZoom(view.zoom) }
    }
  }

  return {
    workspaces,
    canvases,
    widgets,
    relations: parseRelations(parsed.relations, widgets),
    connections: parseConnections(parsed.connections, widgets),
    groups: parseGroups(parsed.groups, widgets),
    activePacks: parsePacks(parsed.activePacks),
    activeWorkspaceId,
    activeCanvasId,
    canvasViews,
  }
}
