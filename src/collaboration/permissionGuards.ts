import type * as Y from 'yjs'
import { useCollaborationStore, canEditCollaborativeCanvas } from '../store/useCollaborationStore'
import {
  clearWidgetHistory,
  setWidgetHistorySuppressed,
  useWidgetStore,
} from '../store/useWidgetStore'
import type { WidgetStoreState } from '../store/widgetStoreTypes'

const MUTATING_ACTIONS = [
  'renameCanvas', 'reparentCanvas', 'importBoardAsCanvas',
  'createWidget', 'commitThoughtPlan', 'moveWidget', 'snapWidgetToGrid',
  'settleWidgets', 'applyGhostDisplacement', 'untangleCanvas', 'autoScaleCanvas',
  'resizeWidget', 'resizeWidgetFromEdge', 'setWidgetScaleState',
  'updateWidgetData', 'updateWidgetTitle', 'toggleWidgetLocked', 'toggleWidgetFavorite',
  'bringWidgetToFront', 'setWidgetHydration', 'updateWidgetMetadata',
  'nudgeSelection', 'addRelation', 'toggleResolveRelation', 'updateRelation', 'deleteRelation',
  'addConnection', 'updateConnection', 'deleteConnection', 'applyWireWrites',
  'glueWidgets', 'unglueWidget',
  'deleteWidget', 'deleteWidgets', 'duplicateWidgets', 'pasteWidgets',
  'importMindmap', 'togglePack', 'commitGhostTree',
] as const satisfies readonly (keyof WidgetStoreState)[]

const STRING_RESULTS = new Set<keyof WidgetStoreState>([
  'createWidget', 'addRelation', 'importBoardAsCanvas',
])
const ARRAY_RESULTS = new Set<keyof WidgetStoreState>(['commitThoughtPlan', 'duplicateWidgets', 'pasteWidgets'])
const BOOLEAN_RESULTS = new Set<keyof WidgetStoreState>(['unglueWidget'])

function blockedResult(action: keyof WidgetStoreState): unknown {
  if (STRING_RESULTS.has(action)) return ''
  if (ARRAY_RESULTS.has(action)) return []
  if (BOOLEAN_RESULTS.has(action)) return false
  if (action === 'addConnection') return null
  return undefined
}

/**
 * Defense-in-depth for read-only roles. Supabase RLS is still authoritative;
 * these wrappers make prohibited UI gestures inert before they can alter local
 * Zustand state. Selection, panning, navigation, and opening dialogs stay local.
 */
export function installCollaborationPermissionGuards(undoManager: Y.UndoManager): () => void {
  clearWidgetHistory()
  setWidgetHistorySuppressed(true)
  const before = useWidgetStore.getState()
  const originals = new Map<keyof WidgetStoreState, unknown>()
  const replacements: Record<string, unknown> = {}
  for (const action of MUTATING_ACTIONS) {
    const original = before[action]
    if (typeof original !== 'function') continue
    originals.set(action, original)
    replacements[action] = (...args: unknown[]) => {
      if (!canEditCollaborativeCanvas(useCollaborationStore.getState().role)) {
        return blockedResult(action)
      }
      return (original as (...values: unknown[]) => unknown)(...args)
    }
  }

  const originalUndo = before.undo
  const originalRedo = before.redo
  const syncUndoStatus = () => useWidgetStore.setState({
    canUndo: undoManager.undoStack.length > 0,
    canRedo: undoManager.redoStack.length > 0,
  })
  replacements.undo = () => {
    if (canEditCollaborativeCanvas(useCollaborationStore.getState().role)) undoManager.undo()
  }
  replacements.redo = () => {
    if (canEditCollaborativeCanvas(useCollaborationStore.getState().role)) undoManager.redo()
  }
  replacements.canUndo = false
  replacements.canRedo = false
  useWidgetStore.setState(replacements as Partial<WidgetStoreState>)

  undoManager.on('stack-item-added', syncUndoStatus)
  undoManager.on('stack-item-popped', syncUndoStatus)
  undoManager.on('stack-cleared', syncUndoStatus)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    setWidgetHistorySuppressed(false)
    clearWidgetHistory()
    undoManager.off('stack-item-added', syncUndoStatus)
    undoManager.off('stack-item-popped', syncUndoStatus)
    undoManager.off('stack-cleared', syncUndoStatus)
    const restored: Record<string, unknown> = {
      undo: originalUndo, redo: originalRedo, canUndo: false, canRedo: false,
    }
    for (const [action, original] of originals) restored[action] = original
    useWidgetStore.setState(restored as Partial<WidgetStoreState>)
  }
}
