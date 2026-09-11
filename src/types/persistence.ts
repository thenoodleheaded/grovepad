import type { Connection } from './circuit'
import type {
  CanvasMeta,
  DomainPack,
  Relation,
  Vector2D,
  Widget,
  WidgetGlue,
  Workspace,
} from './spatial'

export const PERSISTED_BOARD_FORMAT = 'grovepad-board' as const
export const PERSISTED_BOARD_VERSION = 2 as const
export const PERSISTED_DEVICE_FORMAT = 'grovepad-device' as const
export const PERSISTED_DEVICE_VERSION = 1 as const

type CanvasViews = Record<string, { pan: Vector2D; zoom: number }>

/** One open canvas tab. A pointer into `canvases`, never a copy of one. */
export interface CanvasTab {
  id: string
  canvasId: string
}

/**
 * Local-only navigation state. It must never enter cloud or exported board
 * documents. `openTabs`/`activeTabId` arrived after v1 shipped and stay
 * additive on the wire rather than taking a version bump: a build without
 * tabs then still reads the payload as v1 and keeps its cameras instead of
 * resetting navigation on rollback.
 */
export interface BoardNavigationState {
  activeWorkspaceId: string
  activeCanvasId: string
  canvasViews: CanvasViews
}

export interface BoardDeviceState extends BoardNavigationState {
  openTabs: CanvasTab[]
  /** Always names a tab in `openTabs`, and that tab points at `activeCanvasId`. */
  activeTabId: string
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
  glues: Record<string, WidgetGlue>
  activePacks: DomainPack[]
  /**
   * Reader-owned sidecar for future top-level fields. It is non-enumerable on
   * parsed payloads and expanded back into the document by the serializer.
   */
  persistenceUnknownFields?: Record<string, unknown>
  /** Unsupported-but-well-formed semantic records quarantined from this runtime. */
  persistenceUnknownRelations?: Record<string, Record<string, unknown>>
  persistenceUnknownConnections?: Record<string, Record<string, unknown>>
  persistenceUnknownGlues?: Record<string, Record<string, unknown>>
  /** Original pack ordering, including string values introduced by newer builds. */
  persistenceRawActivePacks?: string[]
}

/**
 * Serializer input: the synced document plus the navigation fields older board
 * payloads still echo. Tabs are deliberately absent — the serializer must never
 * be handed anything that could leak the tab row into a document.
 */
export interface PersistedBoardState extends PersistedBoardDocumentState, BoardNavigationState {}

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

/**
 * Fully resolved reader output used to hydrate the runtime store. Board
 * documents never carried tabs, so a hydrated board resolves only the legacy
 * navigation fields; the tab row is device state the reader supplies alongside.
 */
export type HydratedPersistedBoard =
  Omit<PersistedBoard, keyof BoardDeviceState> & BoardNavigationState
