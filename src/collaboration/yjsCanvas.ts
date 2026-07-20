import * as Y from 'yjs'
import type { Connection } from '../types/circuit'
import type { Relation, Widget, WidgetGroup } from '../types/spatial'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import type { CanvasCollaborationSnapshot } from './types'

const ROOT_WIDGETS = 'widgets'
const ROOT_CANVAS = 'canvas'
const ROOT_RELATIONS = 'relations'
const ROOT_CONNECTIONS = 'connections'
const ROOT_GROUPS = 'groups'
const ROOT_TEXTS = 'texts'

const VALIDATION_WORKSPACE_ID = '__collaboration_workspace__'
const MAX_ENTITIES_PER_KIND = 10_000
const MAX_TEXT_CHARACTERS = 2_000_000
const MAX_JSON_CHARACTERS = 8_000_000

export const LOCAL_STORE_ORIGIN = Symbol('grovepad-local-store')
export const REMOTE_TRANSPORT_ORIGIN = Symbol('grovepad-remote-transport')

type JsonRecord = Record<string, unknown>

export class CollaborationPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollaborationPayloadError'
  }
}

function plainJson(value: unknown): unknown {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value)) as unknown
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function replaceMapFields(target: Y.Map<unknown>, source: JsonRecord): void {
  for (const key of [...target.keys()]) {
    if (!(key in source)) target.delete(key)
  }
  for (const [key, value] of Object.entries(source)) {
    const normalized = plainJson(value)
    if (!sameJson(target.get(key), normalized)) target.set(key, normalized)
  }
}

function reconcileRecords<T extends { id: string }>(
  root: Y.Map<Y.Map<unknown>>,
  records: Record<string, T>,
  previous?: Record<string, T>,
): void {
  for (const id of previous ? Object.keys(previous) : [...root.keys()]) {
    if (!records[id]) root.delete(id)
  }
  for (const [id, record] of Object.entries(records)) {
    if (previous?.[id] === record) continue
    let entity = root.get(id)
    if (!(entity instanceof Y.Map)) {
      entity = new Y.Map<unknown>()
      root.set(id, entity)
    }
    replaceMapFields(entity, record as unknown as JsonRecord)
  }
}

function replaceText(target: Y.Text, next: string): void {
  const previous = target.toString()
  if (previous === next) return

  let prefix = 0
  const prefixLimit = Math.min(previous.length, next.length)
  while (prefix < prefixLimit && previous[prefix] === next[prefix]) prefix += 1

  let suffix = 0
  const suffixLimit = Math.min(previous.length - prefix, next.length - prefix)
  while (
    suffix < suffixLimit &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  ) suffix += 1

  const deleteCount = previous.length - prefix - suffix
  if (deleteCount > 0) target.delete(prefix, deleteCount)
  const inserted = next.slice(prefix, next.length - suffix)
  if (inserted) target.insert(prefix, inserted)
}

function collaborativeText(widget: Widget): string | null {
  const text = (widget.data as { text?: unknown }).text
  return typeof text === 'string' ? text : null
}

function withoutCollaborativeText(widget: Widget): Widget {
  if (collaborativeText(widget) === null) return widget
  const data = { ...(widget.data as unknown as JsonRecord) }
  delete data.text
  return { ...widget, data } as unknown as Widget
}

/**
 * Reconciles one canvas snapshot into a Y.Doc. Entity properties use nested
 * Y.Maps so unrelated edits merge independently; note bodies use Y.Text so
 * concurrent character edits are retained rather than last-writer-wins.
 */
export function writeCanvasSnapshot(
  doc: Y.Doc,
  snapshot: CanvasCollaborationSnapshot,
  origin: unknown = LOCAL_STORE_ORIGIN,
  previous?: CanvasCollaborationSnapshot,
): void {
  doc.transact(() => {
    if (!previous || previous.canvas.id !== snapshot.canvas.id || previous.canvas.name !== snapshot.canvas.name) {
      replaceMapFields(doc.getMap(ROOT_CANVAS), snapshot.canvas)
    }
    const widgets = Object.fromEntries(
      Object.entries(snapshot.widgets).map(([id, widget]) => [
        id,
        previous?.widgets[id] === widget ? widget : withoutCollaborativeText(widget),
      ]),
    )
    reconcileRecords(doc.getMap(ROOT_WIDGETS), widgets, previous?.widgets)
    reconcileRecords(doc.getMap(ROOT_RELATIONS), snapshot.relations, previous?.relations)
    reconcileRecords(doc.getMap(ROOT_CONNECTIONS), snapshot.connections, previous?.connections)
    reconcileRecords(doc.getMap(ROOT_GROUPS), snapshot.groups, previous?.groups)

    const texts = doc.getMap<Y.Text>(ROOT_TEXTS)
    for (const id of previous ? Object.keys(previous.widgets) : [...texts.keys()]) {
      if (!snapshot.widgets[id] || collaborativeText(snapshot.widgets[id]!) === null) texts.delete(id)
    }
    for (const [id, widget] of Object.entries(snapshot.widgets)) {
      if (previous?.widgets[id] === widget) continue
      const value = collaborativeText(widget)
      if (value === null) continue
      let text = texts.get(id)
      if (!(text instanceof Y.Text)) {
        text = new Y.Text()
        texts.set(id, text)
      }
      replaceText(text, value)
    }
  }, origin)
}

function readRecords(root: Y.Map<Y.Map<unknown>>, label: string): Record<string, JsonRecord> {
  if (root.size > MAX_ENTITIES_PER_KIND) {
    throw new CollaborationPayloadError(`${label} exceeds ${MAX_ENTITIES_PER_KIND} records`)
  }
  const result: Record<string, JsonRecord> = {}
  for (const [id, value] of root.entries()) {
    if (typeof id !== 'string' || !(value instanceof Y.Map)) continue
    const record = value.toJSON() as JsonRecord
    result[id] = record
  }
  return result
}

function validateSnapshot(
  canvasId: string,
  canvas: JsonRecord,
  widgets: Record<string, JsonRecord>,
  relations: Record<string, JsonRecord>,
  connections: Record<string, JsonRecord>,
  groups: Record<string, JsonRecord>,
): CanvasCollaborationSnapshot {
  if (canvas.id !== canvasId) throw new CollaborationPayloadError('canvas metadata id mismatch')
  const candidate = {
    format: 'grovepad-board',
    v: 2,
    workspaces: {
      [VALIDATION_WORKSPACE_ID]: {
        id: VALIDATION_WORKSPACE_ID,
        name: 'Collaboration validation',
        rootCanvasId: canvasId,
        createdAt: 0,
      },
    },
    canvases: {
      [canvasId]: {
        id: canvasId,
        name: canvas.name,
        workspaceId: VALIDATION_WORKSPACE_ID,
        parentCanvasId: null,
      },
    },
    widgets,
    relations,
    connections,
    groups,
    activePacks: [],
    activeWorkspaceId: VALIDATION_WORKSPACE_ID,
    activeCanvasId: canvasId,
    canvasViews: {},
  }
  const size = JSON.stringify(candidate).length
  if (size > MAX_JSON_CHARACTERS) {
    throw new CollaborationPayloadError(`canvas payload exceeds ${MAX_JSON_CHARACTERS} characters`)
  }
  const parsed = parsePersistedBoard(candidate)
  if (!parsed) throw new CollaborationPayloadError('canvas payload failed board validation')
  return {
    canvasId,
    canvas: { id: canvasId, name: parsed.canvases[canvasId]!.name },
    widgets: parsed.widgets,
    relations: parsed.relations,
    connections: parsed.connections,
    groups: parsed.groups,
  }
}

/** Reads and validates all untrusted CRDT state before it reaches Zustand. */
export function readCanvasSnapshot(doc: Y.Doc, canvasId: string): CanvasCollaborationSnapshot {
  const canvas = doc.getMap(ROOT_CANVAS).toJSON() as JsonRecord
  const widgets = readRecords(doc.getMap(ROOT_WIDGETS), ROOT_WIDGETS)
  const relations = readRecords(doc.getMap(ROOT_RELATIONS), ROOT_RELATIONS)
  const connections = readRecords(doc.getMap(ROOT_CONNECTIONS), ROOT_CONNECTIONS)
  const groups = readRecords(doc.getMap(ROOT_GROUPS), ROOT_GROUPS)
  const texts = doc.getMap<Y.Text>(ROOT_TEXTS)
  if (texts.size > MAX_ENTITIES_PER_KIND) {
    throw new CollaborationPayloadError(`${ROOT_TEXTS} exceeds ${MAX_ENTITIES_PER_KIND} records`)
  }
  for (const [id, text] of texts.entries()) {
    if (!(text instanceof Y.Text)) continue
    if (text.length > MAX_TEXT_CHARACTERS) {
      throw new CollaborationPayloadError(`note ${id} exceeds ${MAX_TEXT_CHARACTERS} characters`)
    }
    if (!widgets[id]) continue
    const data = widgets[id]!.data
    widgets[id]!.data = {
      ...(data && typeof data === 'object' && !Array.isArray(data) ? data as JsonRecord : {}),
      text: text.toString(),
    }
  }
  return validateSnapshot(canvasId, canvas, widgets, relations, connections, groups)
}

/** Select only the active canvas and its internal edges from the board. */
export function snapshotCanvas(
  state: {
    widgets: Record<string, Widget>
    relations: Record<string, Relation>
    connections: Record<string, Connection>
    groups: Record<string, WidgetGroup>
    canvases: Record<string, { id: string; name: string }>
  },
  canvasId: string,
): CanvasCollaborationSnapshot {
  const widgets = Object.fromEntries(
    Object.entries(state.widgets).filter(([, widget]) => widget.canvasId === canvasId),
  )
  const hasWidget = (id: string) => Boolean(widgets[id])
  const relations = Object.fromEntries(
    Object.entries(state.relations).filter(([, edge]) => hasWidget(edge.fromId) && hasWidget(edge.toId)),
  )
  const connections = Object.fromEntries(
    Object.entries(state.connections).filter(([, edge]) => hasWidget(edge.fromId) && hasWidget(edge.toId)),
  )
  const groups = Object.fromEntries(
    Object.entries(state.groups).filter(([, group]) => group.widgetIds.some(hasWidget)),
  )
  const canvas = state.canvases[canvasId]
  if (!canvas) throw new CollaborationPayloadError(`canvas ${canvasId} does not exist locally`)
  return { canvasId, canvas: { id: canvas.id, name: canvas.name }, widgets, relations, connections, groups }
}
