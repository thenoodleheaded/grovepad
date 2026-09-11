import {
  PERSISTED_DEVICE_FORMAT,
  PERSISTED_DEVICE_VERSION,
  type BoardDeviceState,
  type CanvasTab,
  type PersistedBoardDocumentState,
  type PersistedDeviceState,
} from '../types/persistence'
import { resolveCanvasTabs } from '../store/canvasTabs'
import type { Vector2D } from '../types/spatial'
import { clampZoom } from '../types/spatial'

type BoardTopology = Pick<PersistedBoardDocumentState, 'workspaces' | 'canvases'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isCurrentDevicePayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    value.format === PERSISTED_DEVICE_FORMAT &&
    value.v === PERSISTED_DEVICE_VERSION
}

/** Resolve local navigation against the canvases that still exist in the document. */
export function resolvePersistedDeviceState(
  raw: unknown,
  board: BoardTopology,
  legacyFallback?: Partial<BoardDeviceState>,
): BoardDeviceState {
  const source = isCurrentDevicePayload(raw) ? raw : legacyFallback ?? {}
  const firstWorkspace = Object.values(board.workspaces)[0]
  const requestedWorkspaceId = typeof source.activeWorkspaceId === 'string'
    ? source.activeWorkspaceId
    : null
  const activeWorkspaceId = requestedWorkspaceId && board.workspaces[requestedWorkspaceId]
    ? requestedWorkspaceId
    : firstWorkspace?.id ?? ''

  const requestedCanvasId = typeof source.activeCanvasId === 'string'
    ? source.activeCanvasId
    : null
  const activeCanvasId = requestedCanvasId &&
    board.canvases[requestedCanvasId]?.workspaceId === activeWorkspaceId
    ? requestedCanvasId
    : board.workspaces[activeWorkspaceId]?.rootCanvasId ?? Object.keys(board.canvases)[0] ?? ''

  const canvasViews: BoardDeviceState['canvasViews'] = {}
  const rawViews = isRecord(source.canvasViews) ? source.canvasViews : {}
  for (const [canvasId, view] of Object.entries(rawViews)) {
    if (!board.canvases[canvasId] || !isRecord(view)) continue
    if (!isVector(view.pan) || !isFiniteNumber(view.zoom)) continue
    canvasViews[canvasId] = { pan: view.pan, zoom: clampZoom(view.zoom) }
  }

  // A payload written before tabs existed — or one whose tab list is malformed
  // — simply reads as no tabs; the resolver then seeds a single tab on the
  // canvas this device was last looking at, which is the pre-tabs behaviour.
  const rawTabs = Array.isArray(source.openTabs) ? source.openTabs : []
  const openTabs: CanvasTab[] = []
  for (const tab of rawTabs) {
    if (!isRecord(tab)) continue
    if (typeof tab.id !== 'string' || typeof tab.canvasId !== 'string') continue
    openTabs.push({ id: tab.id, canvasId: tab.canvasId })
  }
  const activeTabId = typeof source.activeTabId === 'string' ? source.activeTabId : ''
  const tabs = resolveCanvasTabs({ openTabs, activeTabId, activeCanvasId }, board.canvases)

  return {
    activeWorkspaceId,
    activeCanvasId: tabs.activeCanvasId || activeCanvasId,
    canvasViews,
    openTabs: tabs.openTabs,
    activeTabId: tabs.activeTabId,
  }
}

export function serializePersistedDeviceState(state: BoardDeviceState): PersistedDeviceState {
  return {
    format: PERSISTED_DEVICE_FORMAT,
    v: PERSISTED_DEVICE_VERSION,
    activeWorkspaceId: state.activeWorkspaceId,
    activeCanvasId: state.activeCanvasId,
    canvasViews: state.canvasViews,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
  }
}
