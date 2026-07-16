import type { Connection } from '../types/circuit'
import type { HydratedPersistedBoard } from '../types/persistence'
import type {
  CanvasMeta,
  DomainPack,
  GhostShapeDirection,
  GhostTreeConfig,
  ModuleData,
  ModuleType,
  Relation,
  RelationType,
  SearchResult,
  Size,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from '../types/spatial'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'
import type { WidgetScaleState } from '../utils/widgetScale'

/** Public contract for the board store. Kept separate from the Zustand implementation. */
export interface WidgetStoreState {
  widgets: Record<string, Widget>
  /** Changes only when widget IDs/canvas membership change, not on drag/data edits. */
  widgetStructureVersion: number
  relations: Record<string, Relation>
  /** Circuit wires — value and trigger connections between widget fields. */
  connections: Record<string, Connection>
  blockedWidgetIds: ReadonlySet<string>
  criticalPathVisible: boolean

  /** Origin → Workspaces → Canvases. The branch hierarchy IS the database. */
  workspaces: Record<string, Workspace>
  canvases: Record<string, CanvasMeta>
  activeWorkspaceId: string
  activeCanvasId: string
  /** Last camera per canvas so navigation restores where you left off. */
  canvasViews: Record<string, { pan: Vector2D; zoom: number }>
  /** Opaque future payload fields retained solely for lossless persistence. */
  persistenceUnknownFields: Record<string, unknown>
  persistenceUnknownRelations: Record<string, Record<string, unknown>>
  persistenceUnknownConnections: Record<string, Record<string, unknown>>
  persistenceUnknownGroups: Record<string, Record<string, unknown>>
  persistenceRawActivePacks: string[]

  createWorkspace: (name: string) => string
  renameWorkspace: (id: string, name: string) => void
  reorderWorkspace: (sourceId: string, targetId: string) => void
  /** Deletes a workspace and every canvas/widget beneath it. Guards the last one. */
  deleteWorkspace: (id: string) => void
  switchWorkspace: (id: string) => void
  /** Enter a canvas: saves the current camera, restores the target's. */
  navigateToCanvas: (canvasId: string) => void
  renameCanvas: (canvasId: string, name: string) => void
  reparentCanvas: (canvasId: string, parentCanvasId: string) => void

  createWidget: (title: string, position: Vector2D, type: ModuleType) => string
  /** Commit an interpreted thought as one reversible, collision-safe operation. */
  commitThoughtPlan: (plan: ThoughtPlan, origin: Vector2D, parentId?: string) => string[]
  moveWidget: (id: string, screenDelta: Vector2D, zoom: number) => void
  snapWidgetToGrid: (id: string) => void
  settleWidgets: (ids: string[]) => void
  /** Spread active-canvas nodes apart without resizing them. */
  untangleCanvas: () => void
  /** Fit widgets to content, tidy groups, and remove overlaps. */
  autoScaleCanvas: () => void
  /** `snap: false` for live drag frames (free-form); the release call snaps. */
  resizeWidget: (id: string, newSize: Size, snap?: boolean) => void
  toggleWidgetCollapsed: (id: string) => void
  setWidgetScaleState: (id: string, target: WidgetScaleState, skipHistory?: boolean) => void
  setWidgetsCollapsed: (ids: string[], collapsed: boolean) => void
  updateWidgetData: (widgetId: string, data: ModuleData) => void
  updateWidgetTitle: (widgetId: string, title: string) => void
  toggleWidgetLocked: (widgetId: string) => void
  toggleWidgetFavorite: (widgetId: string) => void
  setWidgetAccent: (widgetId: string, accent?: string) => void
  bringWidgetToFront: (widgetId: string) => void
  setWidgetHydration: (widgetId: string, isHydrating: boolean) => void
  nudgeSelection: (dx: number, dy: number) => void

  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  snapshotHistory: (tag?: string) => void
  loadBoard: (
    board: HydratedPersistedBoard,
    options?: { restorePersistedDeviceState?: boolean },
  ) => void

  flashWidgetId: string | null
  flashWidget: (id: string) => void

  addRelation: (fromId: string, toId: string, type: RelationType) => string
  toggleResolveRelation: (id: string) => void
  updateRelation: (id: string, patch: Partial<Pick<Relation, 'fromId' | 'toId' | 'type'>>) => void
  deleteRelation: (id: string) => void
  toggleCriticalPath: () => void

  addConnection: (connection: Omit<Connection, 'id' | 'enabled'> & { enabled?: boolean }) => string | null
  updateConnection: (id: string, patch: Partial<Omit<Connection, 'id'>>) => void
  deleteConnection: (id: string) => void
  applyWireWrites: (writes: ReadonlyMap<string, ModuleData>) => void

  groups: Record<string, WidgetGroup>
  widgetGroupIndex: Record<string, string>
  createGroup: (widgetIds: string[], label?: string) => string
  dissolveGroup: (groupId: string) => void
  renameGroup: (groupId: string, label: string) => void
  compactGroup: (groupId: string) => void
  addToGroup: (groupId: string, widgetId: string) => void
  joinGroup: (groupId: string, widgetId: string) => void
  removeFromGroup: (groupId: string, widgetId: string) => void
  moveGroup: (groupId: string, screenDelta: Vector2D, zoom: number) => void

  dragOverGroupId: string | null
  setDragOverGroupId: (id: string | null) => void
  hoveredWidgetId: string | null
  setHoveredWidgetId: (id: string | null) => void

  selectedIds: ReadonlySet<string>
  selectWidget: (id: string, additive: boolean) => void
  selectWidgets: (ids: string[]) => void
  clearSelection: () => void

  deleteWidget: (id: string) => void
  deleteWidgets: (ids: string[]) => void
  duplicateWidget: (id: string) => string
  duplicateWidgets: (ids: string[]) => string[]
  pasteWidgets: (sources: Widget[]) => string[]

  renamingWidgetId: string | null
  startRenaming: (id: string) => void
  stopRenaming: () => void

  contextMenu: { widgetId: string; x: number; y: number } | null
  openContextMenu: (widgetId: string, x: number, y: number) => void
  closeContextMenu: () => void

  addWidgetAt: Vector2D | null
  addWidgetView: 'widgets' | 'packs'
  openAddWidget: (worldPos: Vector2D, view?: 'widgets' | 'packs') => void
  closeAddWidget: () => void

  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  importOpen: boolean
  setImportOpen: (open: boolean) => void
  importMindmap: (
    widgets: Record<string, Widget>,
    groups: Record<string, WidgetGroup>,
    relations: Relation[],
  ) => void
  quickAddOpen: boolean
  setQuickAddOpen: (open: boolean) => void

  activePacks: DomainPack[]
  togglePack: (pack: DomainPack) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  searchWidgets: (query: string) => SearchResult[]

  linkDrag: { sourceId: string; cursorWorld: Vector2D; dropScreen: Vector2D } | null
  startLinkDrag: (sourceId: string, cursorWorld: Vector2D, dropScreen: Vector2D) => void
  updateLinkDragCursor: (cursorWorld: Vector2D, dropScreen: Vector2D) => void
  endLinkDrag: (targetId: string | null) => void

  childLinkSource: string | null
  startChildLink: (sourceId: string) => void
  clearChildLink: () => void
  dependencyLinkSource: string | null
  startDependencyLink: (sourceId: string) => void
  clearDependencyLink: () => void

  ghostConfig: GhostTreeConfig | null
  startGhostShaper: (worldX: number, worldY: number) => void
  beginGhostGesture: () => void
  shapeGhostTree: (nodeId: string, direction: GhostShapeDirection, steps: number) => void
  endGhostGesture: () => void
  cancelGhostShaper: () => void
  commitGhostTree: () => void
}
