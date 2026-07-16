import type { Size, Vector2D } from './canvas'
import type { ModuleType } from './modules'
import type { ModuleData } from './widgetData'

export type { Size, Vector2D } from './canvas'
export { clampZoom, GRID_SIZE, screenToWorld, snapToGrid } from './canvas'
export type { Relation, RelationType } from './relations'
export { RELATION_LABELS } from './relations'
export type { CanvasMeta, Workspace } from './workspaces'
export type { DomainPack, ModuleType } from './modules'
export { DOMAIN_PACKS, DOMAIN_PACK_LABELS, MODULE_LABELS, MODULE_PACK_REQUIREMENTS, MODULE_TYPES } from './modules'
export * from './widgetData'

// ---------------------------------------------------------------------------
// Ghost Tree Shaper
// ---------------------------------------------------------------------------

export type GhostShapeDirection = 'up' | 'down' | 'left' | 'right'

export interface GhostTreeNode {
  id: string
  parentId: string | null
  /** Stable sibling order; layout derives x/y from topology after each edit. */
  order: number
  x: number
  y: number
}

/** Live configuration of the tree being sculpted in ghost mode. */
export interface GhostTreeConfig {
  isActive: boolean
  /** World coordinate where the shaper was initiated (grid-snapped). */
  originX: number
  originY: number
  /** A lightweight editable tree. Every ghost node can become a parent. */
  nodes: GhostTreeNode[]
}

export const GHOST_SIBLINGS_PER_SIDE_MAX = 4

/** One grid-cell ghost marker; final widgets remain full-sized on commit. */
export const GHOST_CELL_WIDTH = 40
export const GHOST_CELL_HEIGHT = 40
/** Exactly two grid cells (80px) of clear space between 40px markers. */
export const GHOST_PITCH_X = 120
export const GHOST_PITCH_Y = 120

/** Total ghost cells in a direct-manipulation tree. */
export function ghostTreeWidgetCount(nodes: GhostTreeNode[]): number {
  return nodes.length
}

// ---------------------------------------------------------------------------
// Triage Badge System
// ---------------------------------------------------------------------------

export type StatusDotColor = 'red' | 'yellow' | 'green'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'
export type WidgetBadge =
  | { type: 'status_dot'; color: StatusDotColor }
  | { type: 'priority_flag'; level: PriorityLevel }
  | { type: 'assignee_avatars'; initials: string[] }
  | { type: 'deadline_countdown'; dueDate: string }
  | { type: 'tag_pill'; tags: Array<{ label: string; color: string }> }

/** Focus-mode island arrangement — order and per-island size overrides,
 *  keyed by the island's stable id (`data-island` or its slot index). */
export interface IslandLayout {
  order?: string[]
  sizes?: Record<string, { width?: number; height?: number }>
}

export interface WidgetMetadata {
  badges: WidgetBadge[]
  locked?: boolean
  favorite?: boolean
  accent?: string
  zIndex?: number
  /** @deprecated Superseded by `islandLayout`; retained so old boards parse. */
  panelSizes?: Record<string, Size>
  /** Focus-mode island arrangement (glass constitution, Article XVIII). */
  islandLayout?: IslandLayout
  /** Original local-interpreter input, retained for reversibility and future re-interpretation. */
  sourceText?: string
  interpretationConfidence?: number
}

// ---------------------------------------------------------------------------
// Widget — the primary spatial entity (flat: one module type per card)
// ---------------------------------------------------------------------------

export interface Widget {
  id: string
  /** The single module type this widget renders. */
  type: ModuleType
  title: string
  /** The canvas this widget lives on. */
  canvasId: string
  /** Top-left corner in world coordinates. */
  position: Vector2D
  /** Width and height in world units; both snapped to GRID_SIZE multiples. */
  size: Size
  data: ModuleData
  metadata: WidgetMetadata
  /** Collapsed to a name pill. `size` is the visible pill geometry; the full
      size to restore is retained in `expandedSize`. */
  collapsed?: boolean
  /** Reduced to a compact icon tile; mutually exclusive with `collapsed`. */
  iconified?: boolean
  /** Dormant full-card size preserved while a widget is a pill or icon. */
  expandedSize?: Size
  isHydrating?: boolean
}


/** Fallback pill dimensions of a collapsed widget (grid-aligned). The live
    pill width is measured from the title via pillSizeForTitle(). */
export const COLLAPSED_SIZE: Size = { width: 200, height: 40 }

/** Two grid cells square: large enough to remain a dependable pointer target. */
export const ICONIFIED_SIZE: Size = { width: 80, height: 80 }

// ---------------------------------------------------------------------------
// Widget Groups
// ---------------------------------------------------------------------------

export const GROUP_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

export interface WidgetGroup {
  id: string
  label: string
  widgetIds: string[]
  color: GroupColor
}

// ---------------------------------------------------------------------------
// Command Palette Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string
  type: 'widget' | 'action'
  title: string
  subtitle: string
  position: Vector2D
  /** Canvas the widget lives on — jump navigates there first when it differs. */
  canvasId?: string
}
