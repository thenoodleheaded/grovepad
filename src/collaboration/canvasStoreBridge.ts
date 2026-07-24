import * as Y from 'yjs'
import { useWidgetStore } from '../store/useWidgetStore'
import { buildGlueIndex, computeBlockedWidgetIds } from '../store/widgetGraph'
import type { WidgetStoreState } from '../store/widgetStoreTypes'
import type { CanvasCollaborationSnapshot } from './types'
import {
  LOCAL_STORE_ORIGIN,
  readCanvasSnapshot,
  snapshotCanvas,
  writeCanvasSnapshot,
} from './yjsCanvas'

type CollaborativeBoardState = Pick<
  WidgetStoreState,
  | 'widgets'
  | 'relations'
  | 'connections'
  | 'glues'
  | 'selectedIds'
  | 'widgetStructureVersion'
  | 'canvases'
>

function referencesCanvas(
  fromId: string,
  toId: string,
  canvasWidgetIds: ReadonlySet<string>,
): boolean {
  return canvasWidgetIds.has(fromId) || canvasWidgetIds.has(toId)
}

/**
 * Replaces only one canvas inside the canonical board state. Everything in
 * other canvases remains byte-for-byte referenced, including local device
 * navigation. This is deliberately not an undoable store action: Y.UndoManager
 * owns collaborative undo and tracks only this client's CRDT transactions.
 */
export function mergeCanvasIntoBoard(
  state: CollaborativeBoardState,
  snapshot: CanvasCollaborationSnapshot,
): Partial<WidgetStoreState> {
  const previousIds = new Set(
    Object.values(state.widgets)
      .filter((widget) => widget.canvasId === snapshot.canvasId)
      .map((widget) => widget.id),
  )
  const relevantIds = new Set([...previousIds, ...Object.keys(snapshot.widgets)])
  const retainedWidgets = Object.fromEntries(
    Object.entries(state.widgets).filter(([, widget]) => widget.canvasId !== snapshot.canvasId),
  )
  const widgets = { ...retainedWidgets, ...snapshot.widgets }
  const relations = {
    ...Object.fromEntries(
      Object.entries(state.relations).filter(([, edge]) =>
        !referencesCanvas(edge.fromId, edge.toId, relevantIds),
      ),
    ),
    ...snapshot.relations,
  }
  const connections = {
    ...Object.fromEntries(
      Object.entries(state.connections).filter(([, edge]) =>
        !referencesCanvas(edge.fromId, edge.toId, relevantIds),
      ),
    ),
    ...snapshot.connections,
  }
  const glues = {
    ...Object.fromEntries(
      Object.entries(state.glues).filter(([, glue]) =>
        !glue.widgetIds.some((id) => relevantIds.has(id)),
      ),
    ),
    ...snapshot.glues,
  }
  const existingCanvas = state.canvases[snapshot.canvasId]
  const canvases = existingCanvas
    ? {
        ...state.canvases,
        [snapshot.canvasId]: {
          ...existingCanvas,
          name: snapshot.canvas.name,
          gridIntensity: snapshot.canvas.gridIntensity,
          linksVisible: snapshot.canvas.linksVisible,
          relationStrict: snapshot.canvas.relationStrict,
        },
      }
    : state.canvases
  return {
    canvases,
    widgets,
    relations,
    connections,
    glues,
    widgetGlueIndex: buildGlueIndex(glues),
    blockedWidgetIds: computeBlockedWidgetIds(relations),
    selectedIds: new Set([...state.selectedIds].filter((id) => Boolean(widgets[id]))),
    widgetStructureVersion: state.widgetStructureVersion + 1,
    contextMenu: null,
    linkDrag: null,
    childLinkSource: null,
    dependencyLinkSource: null,
  }
}

export interface CanvasStoreBridgeOptions {
  canvasId: string
  doc?: Y.Doc
  onLocalUpdate?: (update: Uint8Array) => void
  onError?: (error: Error) => void
}

export interface CanvasStoreBridge {
  doc: Y.Doc
  undoManager: Y.UndoManager
  seedFromStore: () => void
  applyDocumentToStore: () => void
  destroy: () => void
}

/** Bind one active canvas to one Y.Doc without replacing the board store. */
export function createCanvasStoreBridge(options: CanvasStoreBridgeOptions): CanvasStoreBridge {
  const doc = options.doc ?? new Y.Doc()
  const scopes = [
    doc.getMap('widgets'),
    doc.getMap('canvas'),
    doc.getMap('relations'),
    doc.getMap('connections'),
    doc.getMap('glues'),
    doc.getMap('texts'),
  ]
  const undoManager = new Y.UndoManager(scopes, {
    trackedOrigins: new Set([LOCAL_STORE_ORIGIN]),
    captureTimeout: 350,
  })
  let applyingDocument = false
  let destroyed = false
  let applyQueued = false
  let previousStoreSnapshot = snapshotCanvas(useWidgetStore.getState(), options.canvasId)

  const report = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    options.onError?.(error)
  }

  const applyDocumentToStore = () => {
    if (destroyed) return
    try {
      const snapshot = readCanvasSnapshot(doc, options.canvasId)
      applyingDocument = true
      useWidgetStore.setState(mergeCanvasIntoBoard(useWidgetStore.getState(), snapshot))
      previousStoreSnapshot = snapshot
    } catch (error) {
      report(error)
    } finally {
      applyingDocument = false
    }
  }

  const queueApply = () => {
    if (applyQueued || destroyed) return
    applyQueued = true
    queueMicrotask(() => {
      applyQueued = false
      applyDocumentToStore()
    })
  }

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOCAL_STORE_ORIGIN) options.onLocalUpdate?.(update)
    else if (origin === undoManager) {
      options.onLocalUpdate?.(update)
      queueApply()
    } else queueApply()
  }
  doc.on('update', onUpdate)

  const unsubscribe = useWidgetStore.subscribe((state, previous) => {
    if (applyingDocument || destroyed) return
    if (
      state.widgets === previous.widgets &&
      state.relations === previous.relations &&
      state.connections === previous.connections &&
      state.glues === previous.glues &&
      state.canvases === previous.canvases
    ) return
    if (!state.canvases[options.canvasId]) return
    try {
      const nextSnapshot = snapshotCanvas(state, options.canvasId)
      writeCanvasSnapshot(doc, nextSnapshot, LOCAL_STORE_ORIGIN, previousStoreSnapshot)
      previousStoreSnapshot = nextSnapshot
    } catch (error) {
      report(error)
    }
  })

  return {
    doc,
    undoManager,
    seedFromStore: () => {
      if (destroyed) return
      const nextSnapshot = snapshotCanvas(useWidgetStore.getState(), options.canvasId)
      writeCanvasSnapshot(doc, nextSnapshot)
      previousStoreSnapshot = nextSnapshot
    },
    applyDocumentToStore,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      unsubscribe()
      doc.off('update', onUpdate)
      undoManager.destroy()
      doc.destroy()
    },
  }
}
