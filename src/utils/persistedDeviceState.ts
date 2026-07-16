import {
  PERSISTED_DEVICE_FORMAT,
  PERSISTED_DEVICE_VERSION,
  type BoardDeviceState,
  type PersistedBoardDocumentState,
  type PersistedDeviceState,
} from '../types/persistence'
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

  return { activeWorkspaceId, activeCanvasId, canvasViews }
}

export function serializePersistedDeviceState(state: BoardDeviceState): PersistedDeviceState {
  return {
    format: PERSISTED_DEVICE_FORMAT,
    v: PERSISTED_DEVICE_VERSION,
    activeWorkspaceId: state.activeWorkspaceId,
    activeCanvasId: state.activeCanvasId,
    canvasViews: state.canvasViews,
  }
}
