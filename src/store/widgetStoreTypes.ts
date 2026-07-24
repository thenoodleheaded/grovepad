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
  WidgetGlue,
  WidgetMetadata,
  Workspace,
} from '../types/spatial'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'
import type { ResizeEdge } from '../utils/widgetResizeEdge'
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
  persistenceUnknownGlues: Record<string, Record<string, unknown>>
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
  updateCanvasSettings: (
    canvasId: string,
    settings: Partial<Pick<CanvasMeta, 'shared' | 'gridIntensity' | 'linksVisible'>>,
  ) => void
  reparentCanvas: (canvasId: string, parentCanvasId: string) => void
  /** Embed an imported board behind one Canvas card without replacing local work. */
  importBoardAsCanvas: (
    board: HydratedPersistedBoard,
    title: string,
    position: Vector2D,
  ) => string

  createWidget: (title: string, position: Vector2D, type: ModuleType) => string
  /** Commit an interpreted thought as one reversible, collision-safe operation. */
  commitThoughtPlan: (plan: ThoughtPlan, origin: Vector2D, parentId?: string) => string[]
  moveWidget: (
    id: string,
    screenDelta: Vector2D,
    zoom: number,
    options?: {
      moveSelection?: boolean
      /** Option-drag: move ONLY this widget, leaving its glue cluster put. */
      soloGlued?: boolean
    },
  ) => void
  snapWidgetToGrid: (id: string) => void
  settleWidgets: (ids: string[]) => void
  /** Commit ghost displacement offsets at drop time, before the release
   *  settle. History was already snapshotted at the gesture's first move. */
  applyGhostDisplacement: (offsets: Record<string, Vector2D>) => void
  /** Spread active-canvas nodes apart without resizing them. */
  untangleCanvas: () => void
  /** Spread only the chosen active-canvas widgets apart. */
  untangleWidgets: (ids: string[]) => void
  /** Fit widgets to content and remove overlaps. */
  autoScaleCanvas: () => void
  /** `snap: false` for live drag frames (free-form); the release call snaps. */
  resizeWidget: (id: string, newSize: Size, snap?: boolean) => void
  /** Resize with the sides the gesture is not moving pinned in place, so a
   *  left/top edge drag walks the origin instead of growing from the centre. */
  resizeWidgetFromEdge: (id: string, newSize: Size, edge: ResizeEdge, snap?: boolean) => void
  setWidgetScaleState: (
    id: string,
    target: WidgetScaleState,
    options?: {
      skipHistory?: boolean
      /** The on-screen box the change is re-centred on — the resting tile when
       *  one is showing, so an icon lands where the tile was rather than on the
       *  dormant full-card footprint. */
      fromSize?: Size
      /** For target `'icon'` only: the exact continuous icon square to land at
       *  instead of the 2×2 floor — how a closing expansion returns an icon at
       *  the precise size it was opened from. */
      toSize?: Size
    },
  ) => void
  updateWidgetData: (
    widgetId: string,
    data: ModuleData,
    options?: { coalesceHistory?: boolean },
  ) => void
  updateWidgetTitle: (widgetId: string, title: string) => void
  toggleWidgetLocked: (widgetId: string) => void
  /** `absorbOffset` folds an expanded card's view offset into the stored
   *  position in the same step as the pin, so pinning holds the card exactly
   *  where it is on screen instead of snapping back to the un-offset anchor. */
  toggleWidgetPinned: (widgetId: string, options?: { absorbOffset?: Vector2D }) => void
  toggleWidgetFavorite: (widgetId: string) => void
  bringWidgetToFront: (widgetId: string) => void
  setWidgetHydration: (widgetId: string, isHydrating: boolean) => void
  updateWidgetMetadata: (widgetId: string, metadata: Partial<WidgetMetadata>) => void
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

  glues: Record<string, WidgetGlue>
  widgetGlueIndex: Record<string, string>
  /** Weld two widgets (and whatever clusters they already belong to) into one
   *  glue cluster. Rides the in-flight drag's history step. */
  glueWidgets: (draggedId: string, targetId: string) => void
  /** Pull one widget off its cluster; dissolves a cluster left with < 2. */
  unglueWidget: (widgetId: string, options?: { skipHistory?: boolean }) => boolean
  /** Commit the live glue intent: snap the dragged widget to the previewed
   *  0.3-cell seam and weld it to the target. True when a bond committed. */
  commitGlue: () => boolean

  /** Ephemeral option-drag intent: the bond a drop would commit right now —
   *  target widget, snap position, and bond axis — for the weld preview. */
  glueIntent: { draggedId: string; targetId: string; position: Vector2D; axis: 'x' | 'y' } | null
  setGlueIntent: (
    intent: { draggedId: string; targetId: string; position: Vector2D; axis: 'x' | 'y' } | null,
  ) => void
  /** The glued widget an option-drag has pulled beyond glue range — release
   *  now and it comes off. Drives the fading weld preview. */
  unglueIntentWidgetId: string | null
  setUnglueIntentWidgetId: (id: string | null) => void
  hoveredWidgetId: string | null
  setHoveredWidgetId: (id: string | null) => void

  selectedIds: ReadonlySet<string>
  selectWidget: (id: string, additive: boolean) => void
  selectWidgets: (ids: string[]) => void
  clearSelection: () => void

  deleteWidget: (id: string) => void
  deleteWidgets: (ids: string[]) => void
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
  setGhostNodeWidgetTypes: (nodeId: string, widgetTypes: ModuleType[]) => void
  addWidgetTypesToGhostNodes: (nodeIds: string[], widgetTypes: ModuleType[]) => void
  cancelGhostShaper: () => void
  commitGhostTree: () => void

  ghostSelectedNodeIds: ReadonlySet<string>
  toggleGhostNodeSelected: (nodeId: string) => void
  addGhostNodesToSelection: (nodeIds: string[]) => void
  clearGhostNodeSelection: () => void
}
