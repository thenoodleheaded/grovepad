import type { Size, Vector2D } from './canvas'
import { GRID_SIZE as CELL } from './canvas'
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
  /** Widget types this tree point will materialize as one compact bundle. */
  widgetTypes: ModuleType[]
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

/** Exactly two grid cells (80px) of clear space between 40px markers. */
export const GHOST_PITCH_X = 120
export const GHOST_PITCH_Y = 120

/** Total ghost cells in a direct-manipulation tree. */
export function ghostTreeWidgetCount(nodes: GhostTreeNode[]): number {
  return nodes.reduce((count, node) => count + node.widgetTypes.length, 0)
}

export function ghostTreeUnconfiguredCount(nodes: GhostTreeNode[]): number {
  return nodes.reduce((count, node) => count + (node.widgetTypes.length === 0 ? 1 : 0), 0)
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

export interface WidgetMetadata {
  badges: WidgetBadge[]
  locked?: boolean
  /** Held open: a pinned widget never returns to its resting face, so it stays
   * the full editable card through every other widget's expand and collapse.
   * Unlike an ephemeral expansion this is a deliberate, durable choice — it
   * belongs to the board, survives reload, and reaches collaborators. */
  pinned?: boolean
  favorite?: boolean
  accent?: string
  zIndex?: number
  completed?: boolean
  showDoneCheckbox?: boolean
  showDeleteButton?: boolean
  showPinButton?: boolean
  showFavoriteButton?: boolean
  showDuplicateButton?: boolean
  showMarkdownButton?: boolean
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
  /** Width and height in world units. Full-card release may grid-snap them;
   * icon size remains continuous inside its allowed range. */
  size: Size
  data: ModuleData
  metadata: WidgetMetadata
  /** Reduced to a compact icon tile. `size` is the visible icon geometry; the
      full size to restore is retained in `expandedSize`. */
  iconified?: boolean
  /** Dormant full-card size preserved while a widget is an icon. */
  expandedSize?: Size
  isHydrating?: boolean
}


/** Two grid cells square: large enough to remain a dependable pointer target,
 * and the floor of the icon's own adjustable range. */
export const ICONIFIED_SIZE: Size = { width: 80, height: 80 }

/** An icon is a square that scales freely across one grid cell while held —
 * from 2×2 up to 3×3 — then snaps to the nearest of those grid squares on
 * release. There are no size states or detents in between. 2×2 is the floor
 * for anything icon-shaped anywhere in the app — a
 * one-cell icon is too small to read or to aim at, so no surface may render
 * one; 3×3 is the ceiling, past which the drag restores the full card. */
export const ICON_MIN_EDGE = CELL * 2 // 80
export const ICON_MAX_EDGE = CELL * 3 // 120

/**
 * The absolute ceiling on a widget's footprint, on both axes, for every path
 * that can change a size — pointer drags, the content floor's auto-grow, data
 * updates, hydration.
 *
 * This is a hard rail, not a default: a type's own `sizing.maxWidth/maxHeight`
 * may sit anywhere below it, but nothing may exceed it. Content-fit
 * (`autoHeight`) types previously fell back to `Infinity` here, so a long
 * checklist grew without limit until it swallowed the board and made its own
 * neighbours unreachable. A card that reaches this ceiling stops growing and
 * scrolls its content instead.
 *
 * 32 cells is deliberately generous — larger than any full-HD viewport shows
 * at 100% zoom — so the cap only ever catches runaway growth, never a
 * legitimately large card.
 */
export const WIDGET_MAX_EDGE = CELL * 32 // 1280px

// ---------------------------------------------------------------------------
// Widget Glue
// ---------------------------------------------------------------------------

/**
 * A glue cluster: widgets welded edge-to-edge at a 0.3-cell seam. No label,
 * no color, no backplate — the widgets themselves are the visual, joined by
 * a gradient weld between their facing edges. Dragging any member moves the
 * whole cluster; option-drag pulls one member off.
 */
export interface WidgetGlue {
  id: string
  widgetIds: string[]
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
