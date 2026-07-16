import type { Connection } from './circuit'
import type {
  CanvasMeta,
  DomainPack,
  Relation,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from './spatial'

export const PERSISTED_BOARD_FORMAT = 'grovepad-board' as const
export const PERSISTED_BOARD_VERSION = 2 as const
export const PERSISTED_DEVICE_FORMAT = 'grovepad-device' as const
export const PERSISTED_DEVICE_VERSION = 1 as const

type CanvasViews = Record<string, { pan: Vector2D; zoom: number }>

/** Local-only navigation state. It must never enter cloud or exported board documents. */
export interface BoardDeviceState {
  activeWorkspaceId: string
  activeCanvasId: string
  canvasViews: CanvasViews
}

export interface PersistedDeviceState extends BoardDeviceState {
  format: typeof PERSISTED_DEVICE_FORMAT
  v: typeof PERSISTED_DEVICE_VERSION
}

/** Canonical synced document fields shared by the store and serializer. */
export interface PersistedBoardDocumentState {
  workspaces: Record<string, Workspace>
  canvases: Record<string, CanvasMeta>
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  /** Circuit wires. Absent in older payloads and normalized to an empty record. */
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
  activePacks: DomainPack[]
  /**
   * Reader-owned sidecar for future top-level fields. It is non-enumerable on
   * parsed payloads and expanded back into the document by the serializer.
   */
  persistenceUnknownFields?: Record<string, unknown>
  /** Unsupported-but-well-formed semantic records quarantined from this runtime. */
  persistenceUnknownRelations?: Record<string, Record<string, unknown>>
  persistenceUnknownConnections?: Record<string, Record<string, unknown>>
  persistenceUnknownGroups?: Record<string, Record<string, unknown>>
  /** Original pack ordering, including string values introduced by newer builds. */
  persistenceRawActivePacks?: string[]
}

/** Runtime store shape: synced document plus local device navigation. */
export interface PersistedBoardState extends PersistedBoardDocumentState, BoardDeviceState {}

/**
 * Self-describing version-2 document written to IndexedDB, cloud, snapshots,
 * and exports. Optional device fields are read-only legacy compatibility.
 */
export interface PersistedBoard extends PersistedBoardDocumentState {
  format: typeof PERSISTED_BOARD_FORMAT
  v: typeof PERSISTED_BOARD_VERSION
  activeWorkspaceId?: string
  activeCanvasId?: string
  canvasViews?: CanvasViews
}

/** Fully resolved reader output used to hydrate the runtime store. */
export type HydratedPersistedBoard =
  Omit<PersistedBoard, keyof BoardDeviceState> & BoardDeviceState
