import { create } from 'zustand'
import { loadPersistedBoard } from '../utils/persistence'
import type { PersistedBoard } from '../utils/persistence'
import type { Connection } from '../types/circuit'
import { commandsFor, fieldDescriptor } from '../widgets/fields'
import { DEFAULT_SIZING, widgetDefinition } from '../widgets/registry'
import { pillSizeForTitle, type WidgetScaleState } from '../utils/widgetScale'
import { GROUP_PAD } from '../utils/groupGeometry'
import { layoutThoughtPlan, layoutWidth } from '../utils/planLayout'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'
import { useCanvasStore } from './useCanvasStore'
import { useToastStore } from './useToastStore'
import type {
  AssignmentData,
  BarChartData,
  BudgetData,
  CanvasMeta,
  CanvasNodeData,
  ChecklistData,
  CitationData,
  CodeData,
  DailyAgendaData,
  DecisionData,
  DecisionMatrixData,
  DomainPack,
  FormWidgetData,
  FormulaSheetData,
  GoalTrackerData,
  GpaData,
  GradeCalcData,
  MeetingNotesData,
  ProsConsData,
  QuizData,
  ReadingListData,
  VocabData,
  WeeklyPlannerData,
  WorldClockData,
  GhostShapeDirection,
  GhostTreeConfig,
  GhostTreeNode,
  GroupColor,
  InventoryData,
  KanbanData,
  LineChartData,
  LinksData,
  LogbookData,
  MetricsData,
  ModuleData,
  ModuleType,
  OutlineData,
  PieChartData,
  PollData,
  ProcessData,
  Relation,
  RelationType,
  RiskRegisterData,
  SearchResult,
  Size,
  TableData,
  SwotData,
  TimesheetData,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from '../types/spatial'
import {
  ICONIFIED_SIZE,
  GROUP_COLORS,
  GHOST_PITCH_X,
  GHOST_PITCH_Y,
  GHOST_SIBLINGS_PER_SIDE_MAX,
  GRID_SIZE,
  MODULE_LABELS,
  snapToGrid,
} from '../types/spatial'

// Low enough that a manual resize can reach a 1x1 grid-cell "micro" square —
// WidgetCard fades the title/content away and shows just the widget's icon
// once both dimensions drop to <= 2 cells.
const MIN_WIDGET_WIDTH = GRID_SIZE
const MIN_WIDGET_HEIGHT = GRID_SIZE
const LAYOUT_GAP = 24
/** Gap between widgets inside a group band — exactly one grid cell, so
 *  members read as magnetized. Must stay ≥ LAYOUT_GAP or the collision
 *  settle would see members as overlapping and tear clusters apart. */
const GROUP_CLUSTER_GAP = GRID_SIZE
const DETACH_GAP = GRID_SIZE * 2
/** Minimum vertical clearance a drag keeps between a parent's bottom edge and its child's top edge. */
const MIN_PARENT_CHILD_GAP = GRID_SIZE * 2
const SETTLE_ITERATION_LIMIT = 180

/** Tidy-tree layout with subtree-width reservation. Leaves occupy one pitch;
 * parents center over their complete child span, so adding any branch makes
 * neighboring subtrees yield enough space instead of crossing or stacking. */
function layoutGhostTree(
  source: GhostTreeNode[],
  originX: number,
  originY: number,
): GhostTreeNode[] {
  const nodes = source.map((node) => ({ ...node }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string, GhostTreeNode[]>()
  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue
    const row = children.get(node.parentId)
    if (row) row.push(node)
    else children.set(node.parentId, [node])
  }
  for (const row of children.values()) row.sort((a, b) => a.order - b.order)
  const widths = new Map<string, number>()
  const measure = (node: GhostTreeNode): number => {
    const row = children.get(node.id) ?? []
    const width = row.length === 0
      ? 1
      : row.reduce((total, child) => total + measure(child), 0)
    widths.set(node.id, width)
    return width
  }
  const root = nodes.find((node) => node.parentId === null)
  if (!root) return nodes
  measure(root)
  const place = (node: GhostTreeNode, start: number, depth: number) => {
    const width = widths.get(node.id) ?? 1
    node.x = (start + width / 2) * GHOST_PITCH_X
    node.y = originY + depth * GHOST_PITCH_Y
    let cursor = start
    for (const child of children.get(node.id) ?? []) {
      place(child, cursor, depth + 1)
      cursor += widths.get(child.id) ?? 1
    }
  }
  place(root, 0, 0)
  const shiftX = originX - root.x
  for (const node of nodes) node.x += shiftX
  return nodes
}

let ghostGestureBase: GhostTreeNode[] | null = null
const ghostGestureIds = new Map<string, string>()

function gestureGhostId(key: string): string {
  const existing = ghostGestureIds.get(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  ghostGestureIds.set(key, id)
  return id
}

interface LayoutRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Height computation — grid-snapped, data-driven
// ---------------------------------------------------------------------------

function computeDataHeight(type: ModuleType, data: ModuleData): number {
  const C = GRID_SIZE
  switch (type) {
    // checklist/bullets: chip subpanels wrap to the card's width, so height
    // comes from the DOM reporter, not a per-item estimate.
    case 'table': {
      const d = data as TableData
      return Math.max(C * 3, (d.rows.length + 1) * C)
    }
    case 'budget': {
      const d = data as BudgetData
      return Math.max(C * 4, (d.items.length + 3) * C)
    }
    case 'links': {
      const d = data as LinksData
      return Math.max(C * 3, Math.ceil((d.items.length * 34 + 72) / C) * C)
    }
    case 'poll': {
      const d = data as PollData
      return Math.max(C * 4, Math.ceil((d.options.length * 36 + 96) / C) * C)
    }
    case 'metrics': {
      const d = data as MetricsData
      const rows = Math.ceil(d.tiles.length / 2)
      return Math.max(C * 3, Math.ceil((rows * 74 + 64) / C) * C)
    }
    case 'bar_chart': {
      const d = data as BarChartData
      return Math.max(C * 3, Math.ceil((d.bars.length * 30 + 88) / C) * C)
    }
    case 'pros_cons': {
      const d = data as ProsConsData
      const rows = Math.max(d.pros.length, d.cons.length)
      return Math.max(C * 4, Math.ceil((rows * 28 + 120) / C) * C)
    }
    case 'weekly_planner': {
      const d = data as WeeklyPlannerData
      const tasks = d.days.reduce((sum, day) => sum + day.length, 0)
      return Math.max(C * 7, Math.ceil((tasks * 24 + 7 * 34 + 48) / C) * C)
    }
    case 'goal_tracker': {
      const d = data as GoalTrackerData
      return Math.max(C * 4, Math.ceil((d.milestones.length * 28 + 148) / C) * C)
    }
    case 'reading_list': {
      const d = data as ReadingListData
      return Math.max(C * 3, Math.ceil((d.items.length * 32 + 80) / C) * C)
    }
    case 'meeting_notes': {
      const d = data as MeetingNotesData
      return Math.max(C * 6, Math.ceil((d.actions.length * 24 + 296) / C) * C)
    }
    case 'decision': {
      const d = data as DecisionData
      return Math.max(C * 4, Math.ceil((d.options.length * 28 + 152) / C) * C)
    }
    case 'world_clock': {
      const d = data as WorldClockData
      return Math.max(C * 3, Math.ceil((d.zones.length * 32 + 80) / C) * C)
    }
    case 'kanban': {
      const d = data as KanbanData
      const tallest = Math.max(1, ...d.columns.map((c) => c.cards.length))
      return Math.max(C * 5, Math.ceil((tallest * 34 + 130) / C) * C)
    }
    case 'code': {
      const d = data as CodeData
      const lines = d.code.split('\n').length
      return Math.max(C * 4, Math.ceil((lines * 18 + 96) / C) * C)
    }
    case 'vocab': {
      const d = data as VocabData
      return Math.max(C * 4, Math.ceil((d.terms.length * 44 + 80) / C) * C)
    }
    case 'grade_calc': {
      const d = data as GradeCalcData
      return Math.max(C * 4, Math.ceil((d.components.length * 32 + 128) / C) * C)
    }
    case 'gpa': {
      const d = data as GpaData
      return Math.max(C * 4, Math.ceil((d.courses.length * 32 + 128) / C) * C)
    }
    case 'assignment': {
      const d = data as AssignmentData
      return Math.max(C * 4, Math.ceil((d.items.length * 34 + 96) / C) * C)
    }
    case 'formula_sheet': {
      const d = data as FormulaSheetData
      return Math.max(C * 4, Math.ceil((d.formulas.length * 40 + 80) / C) * C)
    }
    case 'citation': {
      const d = data as CitationData
      return Math.max(C * 4, Math.ceil((d.sources.length * 52 + 96) / C) * C)
    }
    case 'quiz': {
      const d = data as QuizData
      return Math.max(C * 4, Math.ceil((d.options.length * 34 + 140) / C) * C)
    }
    case 'outline': {
      const d = data as OutlineData
      return Math.max(C * 4, Math.ceil((d.items.length * 30 + 80) / C) * C)
    }
    case 'form': {
      const d = data as FormWidgetData
      return Math.max(C * 5, Math.ceil((d.fields.length * 42 + 120) / C) * C)
    }
    case 'daily_agenda': {
      const d = data as DailyAgendaData
      return Math.max(C * 4, Math.ceil((d.items.length * 34 + 100) / C) * C)
    }
    case 'process': {
      const d = data as ProcessData
      return Math.max(C * 4, Math.ceil((d.steps.length * 34 + 104) / C) * C)
    }
    case 'risk_register': {
      const d = data as RiskRegisterData
      return Math.max(C * 5, Math.ceil((d.items.length * 76 + 110) / C) * C)
    }
    case 'decision_matrix': {
      const d = data as DecisionMatrixData
      return Math.max(C * 5, Math.ceil((d.options.length * 38 + 140) / C) * C)
    }
    case 'swot': {
      const d = data as SwotData
      const rows = Math.max(d.strengths.length, d.weaknesses.length, d.opportunities.length, d.threats.length)
      return Math.max(C * 5, Math.ceil((rows * 28 + 130) / C) * C)
    }
    case 'timesheet': {
      const d = data as TimesheetData
      return Math.max(C * 5, Math.ceil((d.entries.length * 40 + 120) / C) * C)
    }
    case 'inventory': {
      const d = data as InventoryData
      // Inventory items contain two stacked text lines plus quantity controls;
      // the old one-cell estimate forced populated inventories into a scroller.
      return Math.max(C * 6, Math.ceil((d.items.length * 62 + 144) / C) * C)
    }
    case 'logbook': {
      const d = data as LogbookData
      return Math.max(C * 5, Math.ceil((d.entries.length * 54 + 100) / C) * C)
    }
    case 'line_chart': {
      const d = data as LineChartData
      return Math.max(C * 5, Math.ceil((Math.ceil(d.points.length / 3) * 32 + 176) / C) * C)
    }
    case 'pie_chart': {
      const d = data as PieChartData
      return Math.max(C * 5, Math.ceil((d.segments.length * 30 + 150) / C) * C)
    }
    case 'chore_rotation':
      return C * 8
    case 'trip_itinerary': {
      const d = data as {
        days: Array<{ legs: unknown[] }>
      }
      const legCount = d.days.reduce((sum, day) => sum + day.legs.length, 0)
      return Math.max(C * 10, Math.ceil((248 + d.days.length * 72 + legCount * 54) / C) * C)
    }
    default:
      return 0
  }
}

/**
 * Content-driven WIDTH, grid-snapped. Height is the natural axis for content
 * growth (lists/text flow downward), so width stays fixed for almost every
 * type — a notes card widening to fit one long line reads worse than wrapping.
 * Only genuinely 2D/columnar widgets scale on X: their width is a function of
 * column count, not text length, clamped to a comfortable band so a card never
 * becomes unreadably wide or a sliver. Returns 0 to mean "keep current width".
 */
function computeDataWidth(type: ModuleType, data: ModuleData): number {
  const C = GRID_SIZE
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  switch (type) {
    case 'table': {
      const d = data as TableData
      const cols = d.rows.reduce((m, r) => Math.max(m, r.length), 0)
      if (cols === 0) return 0
      // ~130px reading width per column + card padding.
      return clamp(snapToGrid(cols * 130 + 24), C * 5, C * 20)
    }
    case 'kanban': {
      const d = data as KanbanData
      const cols = d.columns.length
      if (cols === 0) return 0
      // Columns sit side by side; ~150px each keeps cards legible.
      return clamp(snapToGrid(cols * 150 + 24), C * 6, C * 26)
    }
    default:
      return 0
  }
}

/**
 * The size a widget should be to fit its content, on both axes. Height comes
 * from computeDataHeight, width from computeDataWidth; each falls back to the
 * widget's current dimension when its type has no content-driven rule. Used by
 * the board-level auto-fit action. Collapsed pills are handled by the caller.
 */
function fitWidgetSize(widget: Widget): Size {
  const h = computeDataHeight(widget.type, widget.data)
  const w = computeDataWidth(widget.type, widget.data)
  return {
    width: w > 0 ? Math.max(MIN_WIDGET_WIDTH, w) : widget.size.width,
    height: h > 0 ? Math.max(MIN_WIDGET_HEIGHT, h) : widget.size.height,
  }
}

// ---------------------------------------------------------------------------
// Fuzzy search helper
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim()
  const t = target.toLowerCase()
  if (!q) return 0
  if (t.includes(q)) return 3
  const words = q.split(/\s+/)
  if (words.length > 1 && words.every((w) => t.includes(w))) return 2
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length ? 1 : 0
}

// ---------------------------------------------------------------------------
// Widget construction — sizes and starter data come from the registry.
// ---------------------------------------------------------------------------

function buildWidget(
  id: string,
  type: ModuleType,
  title: string,
  canvasId: string,
  position: Vector2D,
  size?: Size,
): Widget {
  const def = widgetDefinition(type)
  const data = def.defaultData()
  const dataHeight = computeDataHeight(type, data)
  const initialSize = size ?? {
    ...def.defaultSize,
    height: Math.max(def.defaultSize.height, dataHeight),
  }
  return {
    id,
    type,
    title,
    canvasId,
    position,
    size: initialSize,
    data,
    metadata: { badges: [] },
  }
}

// ---------------------------------------------------------------------------
// Seed data — a starter workspace with its Origin canvas.
// ---------------------------------------------------------------------------

const SEED_WORKSPACE_ID = 'ws-default'
const SEED_ROOT_CANVAS_ID = 'canvas-origin'

function createSeedWorkspaces(): Record<string, Workspace> {
  return {
    [SEED_WORKSPACE_ID]: {
      id: SEED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId: SEED_ROOT_CANVAS_ID,
      createdAt: Date.now(),
      sortIndex: 0,
      tint: '#84cc16',
    },
  }
}

function createSeedCanvases(): Record<string, CanvasMeta> {
  return {
    [SEED_ROOT_CANVAS_ID]: {
      id: SEED_ROOT_CANVAS_ID,
      name: 'Origin',
      workspaceId: SEED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }
}

function createSeedWidgets(): Record<string, Widget> {
  const C = GRID_SIZE
  const root = SEED_ROOT_CANVAS_ID
  const seeds: Widget[] = [
    buildWidget('w-notes-1', 'notes', 'Ideas', root, { x: 120, y: 120 }, { width: 320, height: C * 5 }),
    buildWidget('w-ai-1', 'ai_generator', 'AI Generator', root, { x: 480, y: 120 }, { width: 320, height: C * 4 }),
    buildWidget('w-table-1', 'table', 'Project Ledger', root, { x: 120, y: 400 }, { width: 360, height: C * 4 }),
    buildWidget('w-budget-1', 'budget', 'Budget', root, { x: 520, y: 400 }, { width: 320, height: C * 5 }),
    buildWidget('w-timeline-1', 'timeline', 'Roadmap', root, { x: 120, y: 680 }, { width: 400, height: C * 3 }),
  ]
  return Object.fromEntries(seeds.map((w) => [w.id, w]))
}

function createSeedRelations(): Record<string, Relation> {
  return {
    'rel-seed-parent': {
      id: 'rel-seed-parent',
      fromId: 'w-notes-1',
      toId: 'w-table-1',
      type: 'parent',
      isResolved: true,
    },
    'rel-seed-blocker': {
      id: 'rel-seed-blocker',
      fromId: 'w-table-1',
      toId: 'w-budget-1',
      type: 'blocker',
      isResolved: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withWidget(
  widgets: Record<string, Widget>,
  id: string,
  patch: (w: Widget) => Widget,
): Record<string, Widget> {
  const w = widgets[id]
  if (!w) return widgets
  return { ...widgets, [id]: patch(w) }
}

function uniqueExistingIds(ids: Iterable<string>, widgets: Record<string, Widget>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (seen.has(id) || !widgets[id]) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = LAYOUT_GAP): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

function rectCenter(rect: LayoutRect): Vector2D {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function groupBounds(widgets: Record<string, Widget>, ids: string[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of ids) {
    const w = widgets[id]
    if (!w) continue
    minX = Math.min(minX, w.position.x)
    minY = Math.min(minY, w.position.y)
    maxX = Math.max(maxX, w.position.x + w.size.width)
    maxY = Math.max(maxY, w.position.y + w.size.height)
  }
  if (!isFinite(minX)) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  }
}

function movedIdsForWidget(
  id: string,
  selectedIds: ReadonlySet<string>,
  widgets: Record<string, Widget>,
): string[] {
  if (selectedIds.has(id) && selectedIds.size > 1) {
    return uniqueExistingIds(selectedIds, widgets)
  }
  return widgets[id] ? [id] : []
}

interface ParentIndex {
  parentsOf: Map<string, string[]>
  childrenOf: Map<string, string[]>
}

let parentIndexCache: { relations: Record<string, Relation>; index: ParentIndex } | null = null

/**
 * widgetId → parent/child ids for 'parent' relations, cached by relations
 * identity. Keeps drag-constraint clamping O(degree) per moved widget instead
 * of O(all relations) — relations only change on explicit link edits.
 */
function getParentIndex(relations: Record<string, Relation>): ParentIndex {
  if (parentIndexCache && parentIndexCache.relations === relations) {
    return parentIndexCache.index
  }
  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  for (const rel of Object.values(relations)) {
    if (rel.type !== 'parent') continue
    const parents = parentsOf.get(rel.toId)
    if (parents) parents.push(rel.fromId)
    else parentsOf.set(rel.toId, [rel.fromId])
    const children = childrenOf.get(rel.fromId)
    if (children) children.push(rel.toId)
    else childrenOf.set(rel.fromId, [rel.toId])
  }
  const index = { parentsOf, childrenOf }
  parentIndexCache = { relations, index }
  return index
}

function applyWidgetDelta(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  ids: string[],
  delta: Vector2D,
): Record<string, Widget> {
  if (delta.x === 0 && delta.y === 0) return widgets
  const movingIds = uniqueExistingIds(ids, widgets)
  if (movingIds.length === 0) return widgets

  const positions: Record<string, Vector2D> = {}
  for (const id of movingIds) {
    const widget = widgets[id]!
    positions[id] = {
      x: widget.position.x + delta.x,
      y: widget.position.y + delta.y,
    }
  }

  const { parentsOf, childrenOf } = getParentIndex(relations)
  for (const id of movingIds) {
    const pos = positions[id]!
    const ownHeight = widgets[id]!.size.height
    const parents = parentsOf.get(id)
    if (parents) {
      for (const parentId of parents) {
        const parentWidget = widgets[parentId]
        if (!parentWidget) continue
        const parentPosition = positions[parentId] ?? parentWidget.position
        // Keep at least MIN_PARENT_CHILD_GAP clear below the parent's
        // bottom edge, not just below its top-left corner.
        pos.y = Math.max(
          pos.y,
          parentPosition.y + parentWidget.size.height + MIN_PARENT_CHILD_GAP,
        )
      }
    }
    const children = childrenOf.get(id)
    if (children) {
      for (const childId of children) {
        const childPosition = positions[childId] ?? widgets[childId]?.position
        if (childPosition) {
          pos.y = Math.min(pos.y, childPosition.y - ownHeight - MIN_PARENT_CHILD_GAP)
        }
      }
    }
  }

  const next = { ...widgets }
  for (const id of movingIds) {
    next[id] = { ...widgets[id]!, position: positions[id]! }
  }
  return next
}

function applyWidgetPositions(
  widgets: Record<string, Widget>,
  positions: Record<string, Vector2D>,
): Record<string, Widget> {
  const ids = uniqueExistingIds(Object.keys(positions), widgets)
  if (ids.length === 0) return widgets
  let next: Record<string, Widget> | null = null
  for (const id of ids) {
    const widget = widgets[id]!
    const position = positions[id]!
    if (widget.position.x === position.x && widget.position.y === position.y) continue
    next ??= { ...widgets }
    next[id] = { ...widget, position }
  }
  return next ?? widgets
}

function compactGroupPositions(
  widgets: Record<string, Widget>,
  ids: string[],
): Record<string, Vector2D> {
  const groupIds = uniqueExistingIds(ids, widgets).sort((a, b) => {
    const aw = widgets[a]!
    const bw = widgets[b]!
    return aw.position.y - bw.position.y || aw.position.x - bw.position.x
  })
  if (groupIds.length < 2) return {}

  const bounds = groupBounds(widgets, groupIds)
  if (!bounds) return {}

  const columns = Math.ceil(Math.sqrt(groupIds.length))
  const rows: string[][] = []
  for (let i = 0; i < groupIds.length; i += columns) {
    rows.push(groupIds.slice(i, i + columns))
  }

  const rowMetrics = rows.map((row) => {
    const width =
      row.reduce((total, id) => total + widgets[id]!.size.width, 0) +
      Math.max(0, row.length - 1) * GROUP_CLUSTER_GAP
    const height = Math.max(...row.map((id) => widgets[id]!.size.height))
    return { width, height }
  })

  const clusterWidth = Math.max(...rowMetrics.map((row) => row.width))
  const clusterHeight =
    rowMetrics.reduce((total, row) => total + row.height, 0) +
    Math.max(0, rowMetrics.length - 1) * GROUP_CLUSTER_GAP

  let y = bounds.center.y - clusterHeight / 2
  const positions: Record<string, Vector2D> = {}
  rows.forEach((row, rowIndex) => {
    const metrics = rowMetrics[rowIndex]!
    let x = bounds.center.x - clusterWidth / 2 + (clusterWidth - metrics.width) / 2
    for (const id of row) {
      const widget = widgets[id]!
      positions[id] = {
        x: snapToGrid(x),
        y: snapToGrid(y + (metrics.height - widget.size.height) / 2),
      }
      x += widget.size.width + GROUP_CLUSTER_GAP
    }
    y += metrics.height + GROUP_CLUSTER_GAP
  })

  return positions
}

/** Uniform-grid cell size for the settle pass's spatial hash. */
const SETTLE_CELL = 640

interface CellRange {
  minCX: number
  minCY: number
  maxCX: number
  maxCY: number
}

function sameCellRange(a: CellRange, b: CellRange): boolean {
  return a.minCX === b.minCX && a.minCY === b.minCY && a.maxCX === b.maxCX && a.maxCY === b.maxCY
}

/** Group index read at call time — settle helpers are module functions, so
 *  callers inside a set() that also rewrites groups must pass the fresh
 *  index explicitly instead of relying on this fallback. */
function liveGroupIndex(): Record<string, string> {
  try {
    return useWidgetStore.getState().widgetGroupIndex
  } catch {
    return {}
  }
}

/**
 * Push overlapping neighbors apart until the layout is collision-free.
 * Collision is resolved at CLUSTER granularity: a widget group moves as one
 * rigid unit whose rect is inflated by GROUP_PAD (the band needs clear air),
 * and members of the same group never collide with each other — so the
 * group's internal one-cell magnet spacing survives every settle. Ungrouped
 * widgets are singleton clusters; their behavior is unchanged. Two groups
 * dragged into each other therefore displace like two widgets do, instead
 * of one tearing the other apart member by member.
 */
function settleWidgetLayout(
  widgets: Record<string, Widget>,
  activeIds: string[],
  groupIndexOverride?: Record<string, string>,
): Record<string, Widget> {
  const requested = uniqueExistingIds(activeIds, widgets)
  if (requested.length === 0) return widgets
  const groupIndex = groupIndexOverride ?? liveGroupIndex()
  // Overlap resolution is per-canvas: widgets on other canvases share world
  // coordinates but never collide visually, so they must not be pushed.
  const canvasId = widgets[requested[0]!]!.canvasId
  const allIds = Object.keys(widgets).filter((id) => widgets[id]!.canvasId === canvasId)

  const clusterOf = (id: string): string => {
    const gid = groupIndex[id]
    return gid ? `g:${gid}` : `w:${id}`
  }
  const memberIds = new Map<string, string[]>()
  for (const id of allIds) {
    const key = clusterOf(id)
    const list = memberIds.get(key)
    if (list) list.push(id)
    else memberIds.set(key, [id])
  }

  const queue: string[] = []
  const queued = new Set<string>()
  for (const id of requested) {
    if (widgets[id]!.canvasId !== canvasId) continue
    const key = clusterOf(id)
    if (queued.has(key)) continue
    queued.add(key)
    queue.push(key)
  }
  if (queue.length === 0) return widgets

  const positions: Record<string, Vector2D> = {}
  for (const id of allIds) {
    const widget = widgets[id]!
    positions[id] = queued.has(clusterOf(id))
      ? { x: snapToGrid(widget.position.x), y: snapToGrid(widget.position.y) }
      : widget.position
  }

  const rectFor = (key: string): LayoutRect => {
    const ids = memberIds.get(key)!
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const widget = widgets[id]!
      const pos = positions[id]!
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + widget.size.width)
      maxY = Math.max(maxY, pos.y + widget.size.height)
    }
    const pad = key.startsWith('g:') && ids.length > 1 ? GROUP_PAD : 0
    return {
      id: key,
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    }
  }

  const cells = new Map<string, Set<string>>()
  const ranges = new Map<string, CellRange>()

  const rangeFor = (key: string): CellRange => {
    const rect = rectFor(key)
    return {
      minCX: Math.floor((rect.x - LAYOUT_GAP) / SETTLE_CELL),
      minCY: Math.floor((rect.y - LAYOUT_GAP) / SETTLE_CELL),
      maxCX: Math.floor((rect.x + rect.width + LAYOUT_GAP) / SETTLE_CELL),
      maxCY: Math.floor((rect.y + rect.height + LAYOUT_GAP) / SETTLE_CELL),
    }
  }

  const addToCells = (key: string, range: CellRange) => {
    for (let cy = range.minCY; cy <= range.maxCY; cy++) {
      for (let cx = range.minCX; cx <= range.maxCX; cx++) {
        const cellKey = `${cx}:${cy}`
        const bucket = cells.get(cellKey)
        if (bucket) bucket.add(key)
        else cells.set(cellKey, new Set([key]))
      }
    }
    ranges.set(key, range)
  }

  const reindex = (key: string) => {
    const previous = ranges.get(key)!
    const next = rangeFor(key)
    if (sameCellRange(previous, next)) return
    for (let cy = previous.minCY; cy <= previous.maxCY; cy++) {
      for (let cx = previous.minCX; cx <= previous.maxCX; cx++) {
        cells.get(`${cx}:${cy}`)?.delete(key)
      }
    }
    addToCells(key, next)
  }

  for (const key of memberIds.keys()) addToCells(key, rangeFor(key))

  /** Rigid move: every member shifts by the same grid-aligned delta, so a
   *  displaced group keeps its exact internal arrangement. */
  const displace = (key: string, dx: number, dy: number) => {
    for (const id of memberIds.get(key)!) {
      const pos = positions[id]!
      positions[id] = { x: pos.x + dx, y: pos.y + dy }
    }
    reindex(key)
  }

  let cursor = 0
  let iterations = 0

  while (cursor < queue.length && iterations < SETTLE_ITERATION_LIMIT) {
    const activeKey = queue[cursor++]!
    reindex(activeKey)
    const activeRect = rectFor(activeKey)
    const activeCenter = rectCenter(activeRect)
    const activeRange = ranges.get(activeKey)!

    const candidates = new Set<string>()
    for (let cy = activeRange.minCY; cy <= activeRange.maxCY; cy++) {
      for (let cx = activeRange.minCX; cx <= activeRange.maxCX; cx++) {
        const bucket = cells.get(`${cx}:${cy}`)
        if (!bucket) continue
        for (const key of bucket) candidates.add(key)
      }
    }

    for (const otherKey of candidates) {
      if (otherKey === activeKey) continue
      const otherRect = rectFor(otherKey)
      if (!rectsOverlap(activeRect, otherRect)) continue

      const otherCenter = rectCenter(otherRect)
      const overlapX =
        Math.min(activeRect.x + activeRect.width, otherRect.x + otherRect.width) -
        Math.max(activeRect.x, otherRect.x) +
        LAYOUT_GAP
      const overlapY =
        Math.min(activeRect.y + activeRect.height, otherRect.y + otherRect.height) -
        Math.max(activeRect.y, otherRect.y) +
        LAYOUT_GAP

      // Grid-quantized shift keeps every displaced widget snapped without
      // rounding a small overlap down to a zero-pixel (infinite-loop) push.
      if (overlapX <= overlapY) {
        const direction = otherCenter.x >= activeCenter.x ? 1 : -1
        displace(otherKey, direction * Math.ceil(overlapX / GRID_SIZE) * GRID_SIZE, 0)
      } else {
        const direction = otherCenter.y >= activeCenter.y ? 1 : -1
        displace(otherKey, 0, direction * Math.ceil(overlapY / GRID_SIZE) * GRID_SIZE)
      }

      if (!queued.has(otherKey)) {
        queued.add(otherKey)
        queue.push(otherKey)
      }
    }
    iterations++
  }

  let changed = false
  // Preserve widgets that live on every other canvas. Building `next` only
  // from `allIds` silently erased sibling canvases whenever a collision was
  // resolved on the active one.
  const next: Record<string, Widget> = { ...widgets }
  for (const id of allIds) {
    const widget = widgets[id]!
    const pos = positions[id]!
    if (pos.x === widget.position.x && pos.y === widget.position.y) {
      next[id] = widget
    } else {
      next[id] = { ...widget, position: pos }
      changed = true
    }
  }
  return changed ? next : widgets
}

function settleWidgetsByCanvas(
  widgets: Record<string, Widget>,
  activeIds: Iterable<string>,
  groupIndexOverride?: Record<string, string>,
): Record<string, Widget> {
  const idsByCanvas = new Map<string, string[]>()
  for (const id of activeIds) {
    const canvasId = widgets[id]?.canvasId
    if (!canvasId) continue
    const ids = idsByCanvas.get(canvasId)
    if (ids) ids.push(id)
    else idsByCanvas.set(canvasId, [id])
  }

  let next = widgets
  for (const ids of idsByCanvas.values()) next = settleWidgetLayout(next, ids, groupIndexOverride)
  return next
}

function relationKey(fromId: string, toId: string, type: RelationType): string {
  return `${fromId}\u0000${toId}\u0000${type}`
}

function appendDraftRelation(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
  relationKeys: Set<string>,
  settleIds: Set<string>,
  fromId: string,
  toId: string,
  type: RelationType,
): void {
  if (fromId === toId || !widgets[fromId] || !widgets[toId]) return
  const key = relationKey(fromId, toId, type)
  if (relationKeys.has(key)) return
  relationKeys.add(key)

  const id = crypto.randomUUID()
  relations[id] = {
    id,
    fromId,
    toId,
    type,
    isResolved: type !== 'blocker' && type !== 'conflict',
  }

  if (type !== 'parent') return
  const parent = widgets[fromId]!
  const child = widgets[toId]!
  const minChildY = parent.position.y + parent.size.height + MIN_PARENT_CHILD_GAP
  if (child.position.y >= minChildY) return
  widgets[toId] = {
    ...child,
    position: { ...child.position, y: snapToGrid(minChildY) },
  }
  settleIds.add(toId)
}

/** De-overlap clearance between separate nodes when untangling — 2×2 grid cells. */
const UNTANGLE_GAP = GRID_SIZE * 2

interface ClusterRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Split a required separation into two grid-cell-exact shares that sum to
 * exactly `totalPixels`. Both `rects` and `UNTANGLE_GAP` are always integer
 * multiples of `GRID_SIZE`, so `totalPixels` is too — but naively halving it
 * in continuous space (`totalPixels / 2`) is only itself grid-exact when the
 * cell count is even. Splitting in whole cells first (favoring the far side
 * by one extra cell when the count is odd) keeps every individual push
 * grid-aligned, so the sum can never drift from the exact target the way an
 * independent per-side rounding pass would.
 */
function splitGridCells(totalPixels: number): [number, number] {
  const cells = Math.round(totalPixels / GRID_SIZE)
  const near = Math.floor(cells / 2) * GRID_SIZE
  return [near, totalPixels - near]
}

/**
 * Spread every node on a canvas apart until nothing overlaps, leaving
 * EXACTLY UNTANGLE_GAP (2×2 cells) of clearance between separate nodes —
 * without disturbing arrangements that are already clean.
 *
 * A group untangles AS A UNIT: its members form one rigid cluster (bounding
 * box of the members) that translates together, so their internal layout is
 * preserved and only whole groups are pushed off each other. Every ungrouped
 * widget is its own single-member cluster. Clusters are separated by
 * iterative symmetric relaxation; every push is computed in whole grid cells
 * (`splitGridCells`) so the resulting gap between any two clusters that were
 * touching is exactly UNTANGLE_GAP, never a pixel more or less.
 */
/** Exported for direct unit testing of the exact-gap guarantee — not part of the store's public action surface. */
export function untangleCanvasLayout(
  widgets: Record<string, Widget>,
  groups: Record<string, WidgetGroup>,
  canvasId: string,
): Record<string, Widget> {
  const onCanvas = (id: string) => widgets[id] && widgets[id]!.canvasId === canvasId

  const clusterMembers: string[][] = []
  const assigned = new Set<string>()
  for (const group of Object.values(groups)) {
    const members = group.widgetIds.filter(onCanvas)
    if (members.length === 0) continue
    clusterMembers.push(members)
    for (const id of members) assigned.add(id)
  }
  for (const id of Object.keys(widgets)) {
    if (!onCanvas(id) || assigned.has(id)) continue
    clusterMembers.push([id])
  }

  const n = clusterMembers.length
  if (n < 2) return widgets

  const rects: ClusterRect[] = clusterMembers.map((members) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of members) {
      const w = widgets[id]!
      minX = Math.min(minX, w.position.x)
      minY = Math.min(minY, w.position.y)
      maxX = Math.max(maxX, w.position.x + w.size.width)
      maxY = Math.max(maxY, w.position.y + w.size.height)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  })
  const originX = rects.map((r) => r.x)
  const originY = rects.map((r) => r.y)

  const gap = UNTANGLE_GAP
  const overlaps = (a: ClusterRect, b: ClusterRect) =>
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y

  // Iterative symmetric relaxation: each pass shoves every overlapping pair
  // apart along its shallower axis, splitting the push in whole grid cells so
  // both clusters move roughly equally (keeps the board centered instead of
  // drifting one way) while the combined push remains exactly the required
  // separation — never approximated by rounding. Resolving one pair can nudge
  // another into overlap, so passes repeat until a full sweep finds nothing
  // left touching — or the cap trips on a pathological board.
  const maxPasses = 80
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const a = rects[i]!
      for (let j = i + 1; j < n; j++) {
        const b = rects[j]!
        if (!overlaps(a, b)) continue
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap
        if (overlapX <= overlapY) {
          // b to the right of a → b moves +, a moves − (deterministic on tie).
          const dir = b.x + b.width / 2 >= a.x + a.width / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapX)
          a.x -= dir * pushA
          b.x += dir * pushB
        } else {
          const dir = b.y + b.height / 2 >= a.y + a.height / 2 ? 1 : -1
          const [pushA, pushB] = splitGridCells(overlapY)
          a.y -= dir * pushA
          b.y += dir * pushB
        }
        moved = true
      }
    }
    if (!moved) break
  }

  let changed = false
  const next: Record<string, Widget> = { ...widgets }
  for (let ci = 0; ci < n; ci++) {
    // Every push above was already an exact multiple of GRID_SIZE, so this
    // total is too — snapToGrid here is a defensive no-op, not a rounding step.
    const dx = snapToGrid(rects[ci]!.x - originX[ci]!)
    const dy = snapToGrid(rects[ci]!.y - originY[ci]!)
    if (dx === 0 && dy === 0) continue
    for (const id of clusterMembers[ci]!) {
      const w = widgets[id]!
      next[id] = { ...w, position: { x: w.position.x + dx, y: w.position.y + dy } }
      changed = true
    }
  }
  return changed ? next : widgets
}

function detachPosition(
  widgets: Record<string, Widget>,
  groupWidgetIds: string[],
  widgetId: string,
): Vector2D | null {
  const widget = widgets[widgetId]
  const bounds = groupBounds(
    widgets,
    groupWidgetIds.filter((id) => id !== widgetId),
  )
  if (!widget || !bounds) return null

  const widgetCenter = {
    x: widget.position.x + widget.size.width / 2,
    y: widget.position.y + widget.size.height / 2,
  }
  const horizontal = Math.abs(widgetCenter.x - bounds.center.x) >= Math.abs(widgetCenter.y - bounds.center.y)
  if (horizontal) {
    const toRight = widgetCenter.x >= bounds.center.x
    return {
      x: snapToGrid(toRight ? bounds.x + bounds.width + DETACH_GAP : bounds.x - widget.size.width - DETACH_GAP),
      y: snapToGrid(Math.min(Math.max(widget.position.y, bounds.y), bounds.y + bounds.height)),
    }
  }

  const below = widgetCenter.y >= bounds.center.y
  return {
    x: snapToGrid(Math.min(Math.max(widget.position.x, bounds.x), bounds.x + bounds.width)),
    y: snapToGrid(below ? bounds.y + bounds.height + DETACH_GAP : bounds.y - widget.size.height - DETACH_GAP),
  }
}

function buildGroupIndex(groups: Record<string, WidgetGroup>): Record<string, string> {
  const index: Record<string, string> = {}
  for (const [groupId, g] of Object.entries(groups)) {
    for (const wid of g.widgetIds) index[wid] = groupId
  }
  return index
}

let groupColorIndex = 0
function nextGroupColor(): GroupColor {
  const color = GROUP_COLORS[groupColorIndex % GROUP_COLORS.length] ?? GROUP_COLORS[0]
  groupColorIndex++
  return color
}

function computeBlockedWidgetIds(relations: Record<string, Relation>): Set<string> {
  const blocked = new Set<string>()
  for (const rel of Object.values(relations)) {
    if (rel.type === 'blocker' && !rel.isResolved) blocked.add(rel.toId)
  }
  return blocked
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

export interface CriticalPath {
  widgetIds: string[]
  relationIds: string[]
}

interface CriticalPathCache {
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  result: CriticalPath
}

let criticalPathCache: CriticalPathCache | null = null

export function getCriticalPath(
  widgets: Record<string, Widget>,
  relations: Record<string, Relation>,
): CriticalPath {
  if (
    criticalPathCache &&
    criticalPathCache.widgets === widgets &&
    criticalPathCache.relations === relations
  ) {
    return criticalPathCache.result
  }

  const outgoing = new Map<string, Relation[]>()
  for (const rel of Object.values(relations)) {
    if (rel.type !== 'blocker' || rel.isResolved) continue
    if (!widgets[rel.fromId] || !widgets[rel.toId]) continue
    const list = outgoing.get(rel.fromId)
    if (list) list.push(rel)
    else outgoing.set(rel.fromId, [rel])
  }

  const memo = new Map<string, CriticalPath>()
  const inStack = new Set<string>()

  const longestFrom = (widgetId: string): CriticalPath => {
    const cached = memo.get(widgetId)
    if (cached) return cached
    if (inStack.has(widgetId)) return { widgetIds: [widgetId], relationIds: [] }
    inStack.add(widgetId)
    let best: CriticalPath = { widgetIds: [widgetId], relationIds: [] }
    for (const rel of outgoing.get(widgetId) ?? []) {
      const tail = longestFrom(rel.toId)
      if (tail.relationIds.length + 1 > best.relationIds.length) {
        best = {
          widgetIds: [widgetId, ...tail.widgetIds],
          relationIds: [rel.id, ...tail.relationIds],
        }
      }
    }
    inStack.delete(widgetId)
    memo.set(widgetId, best)
    return best
  }

  let best: CriticalPath = { widgetIds: [], relationIds: [] }
  for (const startId of outgoing.keys()) {
    const chain = longestFrom(startId)
    if (chain.relationIds.length > best.relationIds.length) best = chain
  }

  criticalPathCache = { widgets, relations, result: best }
  return best
}

// ---------------------------------------------------------------------------
// Undo history — reference snapshots of the four structural records.
// Snapshots share unchanged objects with live state, so each entry costs a
// handful of pointers, not a deep copy.
// ---------------------------------------------------------------------------

interface HistorySnapshot {
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
  widgetGroupIndex: Record<string, string>
  canvases: Record<string, CanvasMeta>
  workspaces: Record<string, Workspace>
}

const HISTORY_LIMIT = 100
/** Rapid same-tag edits (typing, slider drags) collapse into one undo step. */
const HISTORY_COALESCE_MS = 900

const historyPast: HistorySnapshot[] = []
const historyFuture: HistorySnapshot[] = []
let historyTag: string | null = null
let historyTagTime = 0

// ---------------------------------------------------------------------------
// Spawn tracking — lets freshly created widgets play a one-shot entrance
// animation without replaying it when they scroll back into view later.
// ---------------------------------------------------------------------------

const recentlySpawnedIds = new Set<string>()

export function isRecentlySpawned(id: string): boolean {
  return recentlySpawnedIds.has(id)
}

function markSpawned(id: string): void {
  recentlySpawnedIds.add(id)
  setTimeout(() => recentlySpawnedIds.delete(id), 600)
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

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
  /**
   * Spread every node on the active canvas apart until nothing overlaps,
   * leaving 2×2 cells of clearance. Groups move as rigid units. No resizing.
   */
  untangleCanvas: () => void
  /**
   * Resize every widget on the active canvas to fit its content (content-driven
   * height, columnar width), re-tidy each group, then untangle so the
   * resulting layout is overlap-free. Collapsed pills are left alone.
   */
  autoScaleCanvas: () => void
  /** `snap: false` for live drag frames (free-form); the release call snaps. */
  resizeWidget: (id: string, newSize: Size, snap?: boolean) => void
  /** Collapse a widget to a name pill, or restore it to full size. */
  toggleWidgetCollapsed: (id: string) => void
  setWidgetScaleState: (id: string, target: WidgetScaleState) => void
  /** Batch collapse/expand — used by multi-select and the shrink-to-collapse gesture. */
  setWidgetsCollapsed: (ids: string[], collapsed: boolean) => void
  updateWidgetData: (widgetId: string, data: ModuleData) => void
  updateWidgetTitle: (widgetId: string, title: string) => void
  toggleWidgetLocked: (widgetId: string) => void
  setWidgetAccent: (widgetId: string, accent?: string) => void
  bringWidgetToFront: (widgetId: string) => void
  setWidgetHydration: (widgetId: string, isHydrating: boolean) => void
  /** Move the current selection by a world-space delta (keyboard nudge). */
  nudgeSelection: (dx: number, dy: number) => void

  /** Undo/redo over widgets, relations, and groups. */
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  /**
   * Capture the current structural state as an undo step. Call before a
   * gesture mutates state (drag/resize start). Same-tag captures within a
   * short window coalesce into a single step.
   */
  snapshotHistory: (tag?: string) => void

  /** Replace the entire board — used when a cloud sync fetch resolves. Clears undo history. */
  loadBoard: (board: PersistedBoard) => void

  /** One-shot locator pulse on a widget (command palette leap). */
  flashWidgetId: string | null
  flashWidget: (id: string) => void

  addRelation: (fromId: string, toId: string, type: RelationType) => string
  toggleResolveRelation: (id: string) => void
  updateRelation: (id: string, patch: Partial<Pick<Relation, 'fromId' | 'toId' | 'type'>>) => void
  deleteRelation: (id: string) => void
  toggleCriticalPath: () => void

  /**
   * Create a circuit wire. Enforces the single-writer rule: a value wire
   * aimed at a field that already has an incoming value wire replaces it.
   * Identical trigger wires dedupe. Self-wires are rejected (returns null).
   */
  addConnection: (connection: Omit<Connection, 'id' | 'enabled'> & { enabled?: boolean }) => string | null
  updateConnection: (id: string, patch: Partial<Omit<Connection, 'id'>>) => void
  deleteConnection: (id: string) => void
  /**
   * Batched engine writes — one set() for a whole propagation wave. Skips
   * missing widgets and identical data, recomputes content-driven heights,
   * and deliberately does NOT push undo history: wire deliveries are
   * consequences of the user edit that seeded the wave, so undoing that edit
   * restores everything in one step.
   */
  applyWireWrites: (writes: ReadonlyMap<string, ModuleData>) => void

  /** Widget groups — visual plates that group widgets with merged relation lines. */
  groups: Record<string, WidgetGroup>
  /** widgetId → groupId reverse index. */
  widgetGroupIndex: Record<string, string>
  createGroup: (widgetIds: string[], label?: string) => string
  dissolveGroup: (groupId: string) => void
  renameGroup: (groupId: string, label: string) => void
  compactGroup: (groupId: string) => void
  addToGroup: (groupId: string, widgetId: string) => void
  /** Lightweight group join — adds membership only, no compaction. Used for drag-drop. */
  joinGroup: (groupId: string, widgetId: string) => void
  removeFromGroup: (groupId: string, widgetId: string) => void
  moveGroup: (groupId: string, screenDelta: Vector2D, zoom: number) => void

  /** Group highlighted as drop target during a widget drag. */
  dragOverGroupId: string | null
  setDragOverGroupId: (id: string | null) => void

  /** Ephemeral hover target used to illuminate this widget's relations. */
  hoveredWidgetId: string | null
  setHoveredWidgetId: (id: string | null) => void

  /** Selected widget IDs — used for multi-select + grouping. */
  selectedIds: ReadonlySet<string>
  selectWidget: (id: string, additive: boolean) => void
  selectWidgets: (ids: string[]) => void
  clearSelection: () => void

  deleteWidget: (id: string) => void
  deleteWidgets: (ids: string[]) => void
  duplicateWidget: (id: string) => string
  /** Duplicate several widgets as a single undo step; selects the clones. */
  duplicateWidgets: (ids: string[]) => string[]
  /** Paste a set of copied widgets at a fixed offset; selects the clones. */
  pasteWidgets: (sources: Widget[]) => string[]

  /** Widget being renamed via F2 or external trigger (cleared after use). */
  renamingWidgetId: string | null
  startRenaming: (id: string) => void
  stopRenaming: () => void

  /** Right-click context menu target for a widget. */
  contextMenu: { widgetId: string; x: number; y: number } | null
  openContextMenu: (widgetId: string, x: number, y: number) => void
  closeContextMenu: () => void

  /** World position the Add Widget picker will spawn at (null = closed). */
  addWidgetAt: Vector2D | null
  /** Which view the picker opens on — the widget grid or the packs library. */
  addWidgetView: 'widgets' | 'packs'
  openAddWidget: (worldPos: Vector2D, view?: 'widgets' | 'packs') => void
  closeAddWidget: () => void

  /** Keyboard shortcut reference overlay. */
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void

  /** Import-document popup (document digestion UI). */
  importOpen: boolean
  setImportOpen: (open: boolean) => void
  importMindmap: (
    widgets: Record<string, Widget>,
    groups: Record<string, WidgetGroup>,
    relations: Relation[],
  ) => void


  /** Quick-add sheet — one widget per line. */
  quickAddOpen: boolean
  setQuickAddOpen: (open: boolean) => void

  activePacks: DomainPack[]
  togglePack: (pack: DomainPack) => void

  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  searchWidgets: (query: string) => SearchResult[]

  /** Active Cmd+drag link draw session. cursorWorld is in world space (no conversion needed at render). */
  linkDrag: { sourceId: string; cursorWorld: Vector2D; dropScreen: Vector2D } | null
  startLinkDrag: (sourceId: string, cursorWorld: Vector2D, dropScreen: Vector2D) => void
  updateLinkDragCursor: (cursorWorld: Vector2D, dropScreen: Vector2D) => void
  /** Call with targetId to queue a relation pick, or null to cancel. */
  endLinkDrag: (targetId: string | null) => void

  /** Set when link drag drops on a valid target; awaiting relation type choice. */

  /** Set when "Link as child of…" is chosen from the context menu. */
  childLinkSource: string | null
  startChildLink: (sourceId: string) => void
  clearChildLink: () => void

  /** Prerequisite picked by "Make prerequisite for…"; the next widget click
   *  becomes the dependent endpoint of a blocker relation. */
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

// Hydrate from localStorage when a saved board exists (even an empty one —
// deleting everything must survive a reload); otherwise seed a starter board.
const persistedBoard = loadPersistedBoard()
const initialWorkspaces = persistedBoard?.workspaces ?? createSeedWorkspaces()
const initialCanvases = persistedBoard?.canvases ?? createSeedCanvases()
const loadedWidgets = persistedBoard?.widgets ?? createSeedWidgets()
// Repair cards enlarged by the short-lived intrinsic-height initialization
// loop. Only types exposed while that build was live are targeted; their new
// registry defaults already include enough room for the complete starter UI.
const INITIAL_FIT_FEEDBACK_TYPES = new Set<ModuleType>([
  'clock_pulse',
  'meal_planner',
  'home_maintenance',
  'chore_rotation',
  'renewals_vault',
])
// Repair heights produced by the short-lived global overflow-growth rule.
// Legitimate intrinsic growth remains below this generous per-type ceiling;
// multi-page form/list cards use their own internal scrollers.
const initialWidgets = Object.fromEntries(
  Object.entries(loadedWidgets).map(([id, widget]) => {
    const definition = widgetDefinition(widget.type)
    const defaultHeight = Math.max(
      definition.defaultSize.height,
      definition.sizing?.minHeight ?? 0,
    )
    const runawayHeight = Math.max(defaultHeight * 2, GRID_SIZE * 12)
    const feedbackLoopHeight =
      INITIAL_FIT_FEEDBACK_TYPES.has(widget.type) && widget.size.height > defaultHeight
    const size =
      !widget.collapsed && !widget.iconified && (widget.size.height > runawayHeight || feedbackLoopHeight)
        ? { ...widget.size, height: defaultHeight }
        : widget.size
    const expandedSize =
      widget.expandedSize && widget.expandedSize.height > runawayHeight
        ? { ...widget.expandedSize, height: defaultHeight }
        : widget.expandedSize
    return [id, size === widget.size && expandedSize === widget.expandedSize
      ? widget
      : { ...widget, size, expandedSize }]
  }),
) as Record<string, Widget>
const initialRelations = persistedBoard?.relations ?? createSeedRelations()
const initialConnections = persistedBoard?.connections ?? {}
const initialGroups = persistedBoard?.groups ?? {}
const initialPacks = persistedBoard?.activePacks ?? []
const initialActiveWorkspaceId =
  persistedBoard?.activeWorkspaceId ?? Object.keys(initialWorkspaces)[0] ?? SEED_WORKSPACE_ID
const initialActiveCanvasId =
  persistedBoard?.activeCanvasId ??
  initialWorkspaces[initialActiveWorkspaceId]?.rootCanvasId ??
  SEED_ROOT_CANVAS_ID
const initialCanvasViews = persistedBoard?.canvasViews ?? {}

/** Root → canvas chain used for the breadcrumb trail. */
export function getCanvasPath(
  canvases: Record<string, CanvasMeta>,
  canvasId: string,
): CanvasMeta[] {
  const path: CanvasMeta[] = []
  let current = canvases[canvasId]
  let guard = 0
  while (current && guard++ < 64) {
    path.unshift(current)
    current = current.parentCanvasId ? canvases[current.parentCanvasId] : undefined
  }
  return path
}

export const useWidgetStore = create<WidgetStoreState>()((set, get) => {
  /** Push the current structural state onto the undo stack (pre-mutation). */
  const pushHistory = (tag?: string) => {
    const now = Date.now()
    if (tag && tag === historyTag && now - historyTagTime < HISTORY_COALESCE_MS) {
      historyTagTime = now
      return
    }
    historyTag = tag ?? null
    historyTagTime = now
    const state = get()
    historyPast.push({
      widgets: state.widgets,
      relations: state.relations,
      connections: state.connections,
      groups: state.groups,
      widgetGroupIndex: state.widgetGroupIndex,
      canvases: state.canvases,
      workspaces: state.workspaces,
    })
    if (historyPast.length > HISTORY_LIMIT) historyPast.shift()
    historyFuture.length = 0
    if (!state.canUndo || state.canRedo) set({ canUndo: true, canRedo: false })
  }

  const applySnapshot = (snapshot: HistorySnapshot) => {
    const state = get()
    const selectedIds = new Set(
      [...state.selectedIds].filter((id) => snapshot.widgets[id]),
    )
    // The active canvas/workspace may not exist in the restored snapshot
    // (undoing past a canvas creation, redoing a cascade delete) — fall back
    // up the chain: same canvas → workspace root → any surviving canvas.
    let activeWorkspaceId = state.activeWorkspaceId
    if (!snapshot.workspaces[activeWorkspaceId]) {
      activeWorkspaceId = Object.keys(snapshot.workspaces)[0] ?? activeWorkspaceId
    }
    let activeCanvasId = state.activeCanvasId
    if (!snapshot.canvases[activeCanvasId]) {
      activeCanvasId =
        snapshot.workspaces[activeWorkspaceId]?.rootCanvasId ??
        Object.keys(snapshot.canvases)[0] ??
        activeCanvasId
    } else {
      activeWorkspaceId = snapshot.canvases[activeCanvasId]!.workspaceId
    }
    set({
      widgets: snapshot.widgets,
      widgetStructureVersion: state.widgetStructureVersion + 1,
      relations: snapshot.relations,
      connections: snapshot.connections,
      groups: snapshot.groups,
      widgetGroupIndex: snapshot.widgetGroupIndex,
      canvases: snapshot.canvases,
      workspaces: snapshot.workspaces,
      activeWorkspaceId,
      activeCanvasId,
      blockedWidgetIds: computeBlockedWidgetIds(snapshot.relations),
      selectedIds,
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      canUndo: historyPast.length > 0,
      canRedo: historyFuture.length > 0,
    })
  }

  const currentSnapshot = (): HistorySnapshot => {
    const state = get()
    return {
      widgets: state.widgets,
      relations: state.relations,
      connections: state.connections,
      groups: state.groups,
      widgetGroupIndex: state.widgetGroupIndex,
      canvases: state.canvases,
      workspaces: state.workspaces,
    }
  }

  /** Shared canvas-navigation core: park the camera, swap canvas, restore. */
  const navigateToCanvasImpl = (canvasId: string) => {
    const state = get()
    const target = state.canvases[canvasId]
    if (!target || canvasId === state.activeCanvasId) return
    const camera = useCanvasStore.getState()
    const canvasViews = {
      ...state.canvasViews,
      [state.activeCanvasId]: { pan: camera.pan, zoom: camera.zoom },
    }
    set({
      activeCanvasId: canvasId,
      activeWorkspaceId: target.workspaceId,
      canvasViews,
      selectedIds: new Set<string>(),
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      ghostConfig: null,
    })
    const saved = canvasViews[canvasId]
    if (saved) camera.setView(saved.pan, saved.zoom)
    else camera.setView({ x: 0, y: 0 }, 1)
  }

  return {
  widgets: initialWidgets,
  widgetStructureVersion: 0,
  relations: initialRelations,
  connections: initialConnections,
  blockedWidgetIds: computeBlockedWidgetIds(initialRelations),
  criticalPathVisible: false,

  workspaces: initialWorkspaces,
  canvases: initialCanvases,
  activeWorkspaceId: initialActiveWorkspaceId,
  activeCanvasId: initialActiveCanvasId,
  canvasViews: initialCanvasViews,

  createWorkspace: (name) => {
    const trimmed = name.trim() || 'Untitled'
    const workspaceId = crypto.randomUUID()
    const rootCanvasId = crypto.randomUUID()
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          id: workspaceId,
          name: trimmed,
          rootCanvasId,
          createdAt: Date.now(),
          sortIndex: Object.keys(state.workspaces).length,
          tint: ['#84cc16', '#60a5fa', '#a78bfa', '#f59e0b'][Object.keys(state.workspaces).length % 4],
        },
      },
      canvases: {
        ...state.canvases,
        [rootCanvasId]: {
          id: rootCanvasId,
          name: 'Origin',
          workspaceId,
          parentCanvasId: null,
        },
      },
    }))
    navigateToCanvasImpl(rootCanvasId)
    useToastStore.getState().addToast(`Workspace “${trimmed}” created`)
    return workspaceId
  },

  renameWorkspace: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => {
      const ws = state.workspaces[id]
      if (!ws || ws.name === trimmed) return state
      return { workspaces: { ...state.workspaces, [id]: { ...ws, name: trimmed } } }
    })
  },

  reorderWorkspace: (sourceId, targetId) => {
    if (sourceId === targetId) return
    const state = get()
    if (!state.workspaces[sourceId] || !state.workspaces[targetId]) return
    const ordered = Object.values(state.workspaces).sort(
      (a, b) => (a.sortIndex ?? a.createdAt) - (b.sortIndex ?? b.createdAt),
    )
    const source = ordered.find((workspace) => workspace.id === sourceId)!
    const remaining = ordered.filter((workspace) => workspace.id !== sourceId)
    remaining.splice(remaining.findIndex((workspace) => workspace.id === targetId), 0, source)
    set((current) => ({
      workspaces: Object.fromEntries(
        remaining.map((workspace, index) => [workspace.id, { ...current.workspaces[workspace.id]!, sortIndex: index }]),
      ),
    }))
  },

  deleteWorkspace: (id) => {
    const state = get()
    const ws = state.workspaces[id]
    if (!ws || Object.keys(state.workspaces).length <= 1) return
    pushHistory()
    set((current) => {
      const workspaces = { ...current.workspaces }
      delete workspaces[id]

      const canvases: Record<string, CanvasMeta> = {}
      const removedCanvasIds = new Set<string>()
      for (const [cid, canvas] of Object.entries(current.canvases)) {
        if (canvas.workspaceId === id) removedCanvasIds.add(cid)
        else canvases[cid] = canvas
      }

      const widgets: Record<string, Widget> = {}
      for (const [wid, widget] of Object.entries(current.widgets)) {
        if (!removedCanvasIds.has(widget.canvasId)) widgets[wid] = widget
      }

      const relations: Record<string, Relation> = {}
      for (const [rid, relation] of Object.entries(current.relations)) {
        if (widgets[relation.fromId] && widgets[relation.toId]) relations[rid] = relation
      }

      const connections: Record<string, Connection> = {}
      for (const [cid, connection] of Object.entries(current.connections)) {
        if (widgets[connection.fromId] && widgets[connection.toId]) connections[cid] = connection
      }

      const groups: Record<string, WidgetGroup> = {}
      for (const [gid, group] of Object.entries(current.groups)) {
        const widgetIds = group.widgetIds.filter((wid) => widgets[wid])
        if (widgetIds.length >= 2) groups[gid] = { ...group, widgetIds }
      }

      const canvasViews = { ...current.canvasViews }
      for (const cid of removedCanvasIds) delete canvasViews[cid]

      return {
        workspaces,
        canvases,
        widgets,
        widgetStructureVersion: current.widgetStructureVersion + 1,
        relations,
        connections,
        groups,
        widgetGroupIndex: buildGroupIndex(groups),
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        canvasViews,
        selectedIds: new Set<string>(),
      }
    })
    // If we were inside the deleted workspace, land on another one's root.
    const after = get()
    if (!after.workspaces[after.activeWorkspaceId] || !after.canvases[after.activeCanvasId]) {
      const fallback = Object.values(after.workspaces)[0]
      if (fallback) {
        set({ activeWorkspaceId: fallback.id, activeCanvasId: fallback.rootCanvasId })
        const saved = after.canvasViews[fallback.rootCanvasId]
        const camera = useCanvasStore.getState()
        if (saved) camera.setView(saved.pan, saved.zoom)
        else camera.setView({ x: 0, y: 0 }, 1)
      }
    }
    useToastStore.getState().addToast(`Deleted workspace “${ws.name}”`, {
      action: { label: 'Undo', run: () => get().undo() },
    })
  },

  switchWorkspace: (id) => {
    const ws = get().workspaces[id]
    if (!ws) return
    navigateToCanvasImpl(ws.rootCanvasId)
  },

  navigateToCanvas: (canvasId) => navigateToCanvasImpl(canvasId),

  renameCanvas: (canvasId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => {
      const canvas = state.canvases[canvasId]
      if (!canvas || canvas.name === trimmed) return state
      // Keep the owning canvas-node widget's title in sync.
      let widgets = state.widgets
      for (const widget of Object.values(state.widgets)) {
        if (
          widget.type === 'canvas_node' &&
          (widget.data as CanvasNodeData).canvasId === canvasId &&
          widget.title !== trimmed
        ) {
          widgets = { ...widgets, [widget.id]: { ...widget, title: trimmed } }
        }
      }
      return {
        canvases: { ...state.canvases, [canvasId]: { ...canvas, name: trimmed } },
        widgets,
      }
    })
  },

  reparentCanvas: (canvasId, parentCanvasId) => {
    const state = get()
    const canvas = state.canvases[canvasId]
    const parent = state.canvases[parentCanvasId]
    if (!canvas || !parent || canvas.parentCanvasId === null || canvas.workspaceId !== parent.workspaceId || canvasId === parentCanvasId) return
    let cursor: CanvasMeta | undefined = parent
    while (cursor) {
      if (cursor.id === canvasId) return
      cursor = cursor.parentCanvasId ? state.canvases[cursor.parentCanvasId] : undefined
    }
    pushHistory()
    set((current) => ({ canvases: { ...current.canvases, [canvasId]: { ...canvas, parentCanvasId } } }))
  },

  canUndo: false,
  canRedo: false,

  undo: () => {
    const snapshot = historyPast.pop()
    if (!snapshot) return
    historyFuture.push(currentSnapshot())
    historyTag = null
    applySnapshot(snapshot)
  },

  redo: () => {
    const snapshot = historyFuture.pop()
    if (!snapshot) return
    historyPast.push(currentSnapshot())
    historyTag = null
    applySnapshot(snapshot)
  },

  snapshotHistory: (tag) => pushHistory(tag),

  loadBoard: (board) => {
    historyPast.length = 0
    historyFuture.length = 0
    historyTag = null
    const current = get()
    set({
      workspaces: board.workspaces,
      canvases: board.canvases,
      widgets: board.widgets,
      widgetStructureVersion: current.widgetStructureVersion + 1,
      relations: board.relations,
      connections: board.connections,
      groups: board.groups,
      widgetGroupIndex: buildGroupIndex(board.groups),
      activePacks: board.activePacks,
      activeWorkspaceId: board.activeWorkspaceId,
      activeCanvasId: board.activeCanvasId,
      canvasViews: board.canvasViews,
      blockedWidgetIds: computeBlockedWidgetIds(board.relations),
      selectedIds: new Set(),
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      ghostConfig: null,
      canUndo: false,
      canRedo: false,
    })
  },

  flashWidgetId: null,
  flashWidget: (id) => {
    if (!get().widgets[id]) return
    set({ flashWidgetId: id })
    setTimeout(() => {
      if (get().flashWidgetId === id) set({ flashWidgetId: null })
    }, 1500)
  },

  createWidget: (title, position, type) => {
    pushHistory()
    const id = crypto.randomUUID()
    const state = get()
    const widget = buildWidget(id, type, title, state.activeCanvasId, {
      x: snapToGrid(position.x),
      y: snapToGrid(position.y),
    })
    // A canvas node is backed by a real canvas — create it alongside.
    let newCanvas: CanvasMeta | null = null
    if (type === 'canvas_node') {
      const subCanvasId = crypto.randomUUID()
      newCanvas = {
        id: subCanvasId,
        name: title,
        workspaceId: state.activeWorkspaceId,
        parentCanvasId: state.activeCanvasId,
      }
      widget.data = { canvasId: subCanvasId }
    }
    set((current) => ({
      widgets: settleWidgetLayout({ ...current.widgets, [id]: widget }, [id]),
      widgetStructureVersion: current.widgetStructureVersion + 1,
      ...(newCanvas ? { canvases: { ...current.canvases, [newCanvas.id]: newCanvas } } : {}),
    }))
    markSpawned(id)
    return id
  },

  commitThoughtPlan: (plan, origin, parentId) => {
    if (plan.nodes.length === 0) return []
    pushHistory('thought-plan')

    const state = get()
    let widgets = { ...state.widgets }
    const relations = { ...state.relations }
    let canvases = state.canvases
    const ids = new Map<string, string>()
    const created: string[] = []
    const settleIds = new Set<string>()
    const relationKeys = new Set(
      Object.values(relations).map((relation) =>
        relationKey(relation.fromId, relation.toId, relation.type),
      ),
    )
    // Tidy-tree layout: children rows under centered parents, grouped
    // attachments in a one-cell magnet strip beside their host. The tree is
    // centered horizontally on the origin so commits land where the user
    // is looking instead of sprawling rightward off-screen.
    const nodeSizes: Record<string, { width: number; height: number }> = {}
    for (const node of plan.nodes) {
      const defaultSize = widgetDefinition(node.widgetType).defaultSize
      const dataHeight = node.widgetType === 'canvas_node'
        ? 0
        : computeDataHeight(node.widgetType, node.data)
      nodeSizes[node.temporaryId] = {
        width: defaultSize.width,
        height: dataHeight > 0 ? dataHeight : defaultSize.height,
      }
    }
    const treePositions = layoutThoughtPlan(plan, nodeSizes)
    const treeWidth = layoutWidth(treePositions, nodeSizes)

    plan.nodes.forEach((node) => {
      if (node.existingWidgetId && widgets[node.existingWidgetId]) {
        ids.set(node.temporaryId, node.existingWidgetId)
        return
      }

      const id = crypto.randomUUID()
      const treePosition = treePositions[node.temporaryId] ?? { x: 0, y: 0 }
      const widget = buildWidget(id, node.widgetType, node.title, state.activeCanvasId, {
        x: snapToGrid(origin.x - treeWidth / 2 + treePosition.x),
        y: snapToGrid(origin.y + treePosition.y),
      })

      if (node.widgetType === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        canvases = {
          ...canvases,
          [subCanvasId]: {
            id: subCanvasId,
            name: node.title,
            workspaceId: state.activeWorkspaceId,
            parentCanvasId: state.activeCanvasId,
          },
        }
        widget.data = { canvasId: subCanvasId }
      } else {
        const height = computeDataHeight(node.widgetType, node.data)
        widget.data = node.data
        if (height > 0 && height !== widget.size.height) {
          widget.size = { ...widget.size, height }
        }
      }
      widget.metadata = node.metadata

      widgets[id] = widget
      ids.set(node.temporaryId, id)
      created.push(id)
      settleIds.add(id)
    })

    for (const relation of plan.relations) {
      const fromId = ids.get(relation.fromTemporaryId)
      const toId = ids.get(relation.toTemporaryId)
      if (fromId && toId) {
        appendDraftRelation(
          widgets,
          relations,
          relationKeys,
          settleIds,
          fromId,
          toId,
          relation.type,
        )
      }
    }

    if (parentId && widgets[parentId]) {
      const childIds = new Set(plan.relations.map((relation) => relation.toTemporaryId))
      for (const node of plan.nodes) {
        if (childIds.has(node.temporaryId)) continue
        const childId = ids.get(node.temporaryId)
        if (childId) {
          appendDraftRelation(
            widgets,
            relations,
            relationKeys,
            settleIds,
            parentId,
            childId,
            'parent',
          )
        }
      }
    }

    // Materialize proposed groups as real widget groups (band + pill) in the
    // same set() so the whole commit stays one undo step. Members already in
    // a group are pulled out of it, mirroring createGroup's semantics.
    let groups = state.groups
    if (plan.groups.length > 0) {
      const nextGroups = { ...groups }
      const memberIndex = buildGroupIndex(nextGroups)
      let changed = false
      for (const proposed of plan.groups) {
        const memberIds = [...new Set(
          proposed.memberTemporaryIds
            .map((temporaryId) => ids.get(temporaryId))
            .filter((id): id is string => Boolean(id && widgets[id])),
        )]
        if (memberIds.length < 2) continue
        for (const memberId of memberIds) {
          const existingGroupId = memberIndex[memberId]
          if (!existingGroupId || !nextGroups[existingGroupId]) continue
          const remaining = nextGroups[existingGroupId].widgetIds.filter((id) => !memberIds.includes(id))
          if (remaining.length < 2) delete nextGroups[existingGroupId]
          else nextGroups[existingGroupId] = { ...nextGroups[existingGroupId], widgetIds: remaining }
        }
        const groupId = crypto.randomUUID()
        nextGroups[groupId] = {
          id: groupId,
          label: proposed.label ?? 'Group',
          widgetIds: memberIds,
          color: nextGroupColor(),
        }
        for (const memberId of memberIds) memberIndex[memberId] = groupId
        changed = true
      }
      if (changed) groups = nextGroups
    }

    const selectedIds = new Set(created.length ? created : ids.values())
    const widgetGroupIndex = buildGroupIndex(groups)
    // A newly materialized thought group can contain nodes that were laid out
    // in separate branches of the thought tree. Pack it *before* collision
    // settling: otherwise its first rigid cluster bounds span the entire
    // branch, and a single overlap can propel the whole group across the board.
    for (const group of Object.values(groups)) {
      const members = group.widgetIds.filter((id) => widgets[id]?.canvasId === state.activeCanvasId)
      if (members.length >= 2) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, members))
        for (const memberId of members) settleIds.add(memberId)
      }
    }
    set({
      widgets: settleWidgetsByCanvas(widgets, settleIds, widgetGroupIndex),
      widgetStructureVersion:
        state.widgetStructureVersion + (created.length > 0 ? 1 : 0),
      canvases,
      relations,
      groups,
      widgetGroupIndex,
      blockedWidgetIds: computeBlockedWidgetIds(relations),
      selectedIds,
    })
    for (const id of created) markSpawned(id)
    return created
  },

  moveWidget: (id, screenDelta, zoom) => {
    const safeZoom = zoom > 0 ? zoom : 1
    set((state) => {
      if (state.widgets[id]?.metadata.locked) return state
      const ids = movedIdsForWidget(id, state.selectedIds, state.widgets).filter(
        (widgetId) => !state.widgets[widgetId]?.metadata.locked,
      )
      if (ids.length === 0) return state
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        ids,
        { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom },
      )
      if (widgets === state.widgets) return state
      return { widgets }
    })
  },

  snapWidgetToGrid: (id) => {
    set((state) => {
      const w = state.widgets[id]
      if (!w || w.metadata.locked) return state
      return {
        widgets: applyWidgetPositions(state.widgets, {
          [id]: { x: snapToGrid(w.position.x), y: snapToGrid(w.position.y) },
        }),
      }
    })
  },

  settleWidgets: (ids) => {
    set((state) => {
      const validIds = uniqueExistingIds(ids, state.widgets)
      if (validIds.length === 0) return state
      // Magnet: any group a dragged widget belongs to snaps back into its
      // tight one-cell arrangement on release — members always pull
      // together instead of drifting apart inside the band.
      const touchedGroupIds = new Set<string>()
      for (const id of validIds) {
        const groupId = state.widgetGroupIndex[id]
        if (groupId && state.groups[groupId]) touchedGroupIds.add(groupId)
      }
      let widgets = state.widgets
      const settleIds = new Set(validIds)
      for (const groupId of touchedGroupIds) {
        const memberIds = state.groups[groupId]!.widgetIds
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, memberIds))
        for (const memberId of memberIds) settleIds.add(memberId)
      }
      return { widgets: settleWidgetLayout(widgets, [...settleIds], state.widgetGroupIndex) }
    })
  },

  untangleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId
    // Repair existing boards created before group packing happened at commit
    // time. Untangling wide, scattered group bounds only makes the sprawl
    // worse; tighten each group first, then resolve collisions between the
    // resulting compact clusters.
    let widgets = state.widgets
    for (const group of Object.values(state.groups)) {
      const members = group.widgetIds.filter((id) => widgets[id]?.canvasId === canvasId)
      if (members.length >= 2) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, members))
      }
    }
    const untangled = untangleCanvasLayout(widgets, state.groups, canvasId)
    if (untangled === state.widgets) {
      useToastStore.getState().addToast('Layout already untangled')
      return
    }
    pushHistory()
    set({ widgets: untangled })
    useToastStore.getState().addToast('Untangled layout')
  },

  autoScaleCanvas: () => {
    const state = get()
    const canvasId = state.activeCanvasId

    // 1. Fit each expanded widget on this canvas to its content.
    let widgets = { ...state.widgets }
    for (const id of Object.keys(widgets)) {
      const w = widgets[id]!
      if (w.canvasId !== canvasId || w.collapsed || w.iconified) continue
      const size = fitWidgetSize(w)
      if (size.width !== w.size.width || size.height !== w.size.height) {
        widgets[id] = { ...w, size }
      }
    }

    // 2. Re-tidy every group's internal packing so resized members don't
    //    overlap one another inside the plate.
    for (const group of Object.values(state.groups)) {
      const members = group.widgetIds.filter((id) => widgets[id]?.canvasId === canvasId)
      if (members.length >= 2) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, members))
      }
    }

    // 3. Untangle so any overlaps the resize introduced are cleared, groups
    //    still moving as rigid units.
    widgets = untangleCanvasLayout(widgets, state.groups, canvasId)

    // Did anything on this canvas actually move or resize?
    const original = state.widgets
    const changed = Object.keys(widgets).some((id) => {
      const before = original[id]
      const after = widgets[id]!
      return (
        after.canvasId === canvasId &&
        before !== undefined &&
        (before.size.width !== after.size.width ||
          before.size.height !== after.size.height ||
          before.position.x !== after.position.x ||
          before.position.y !== after.position.y)
      )
    })
    if (!changed) {
      useToastStore.getState().addToast('Widgets already fit their content')
      return
    }
    pushHistory()
    set({ widgets })
    useToastStore.getState().addToast('Fit widgets to content')
  },

  resizeWidget: (id, newSize, snap = true) => {
    set((state) => {
      const w = state.widgets[id]
      if (!w || w.metadata.locked) return state
      let size = snap
        ? {
            width: Math.max(MIN_WIDGET_WIDTH, snapToGrid(newSize.width)),
            height: Math.max(MIN_WIDGET_HEIGHT, snapToGrid(newSize.height)),
          }
        : {
            width: Math.max(MIN_WIDGET_WIDTH, newSize.width),
            height: Math.max(MIN_WIDGET_HEIGHT, newSize.height),
          }
      // Full-state cards obey their type's size window. Pills and icon tiles
      // are state-managed sizes and skip the clamp entirely.
      if (!w.collapsed && !w.iconified) {
        const rules = widgetDefinition(w.type).sizing
        size = {
          width: Math.min(
            rules?.maxWidth ?? Infinity,
            Math.max(rules?.minWidth ?? DEFAULT_SIZING.minWidth, size.width),
          ),
          height: Math.min(
            rules?.maxHeight ?? Infinity,
            Math.max(rules?.minHeight ?? DEFAULT_SIZING.minHeight, size.height),
          ),
        }
      }
      if (size.width === w.size.width && size.height === w.size.height) return state
      return {
        widgets: withWidget(state.widgets, id, (w) => ({
          ...w,
          size,
        })),
      }
    })
  },

  toggleWidgetCollapsed: (id) => {
    const w = get().widgets[id]
    if (!w) return
    get().setWidgetScaleState(id, w.collapsed ? 'full' : 'pill')
  },

  setWidgetScaleState: (id, target) => {
    const w = get().widgets[id]
    if (!w || w.metadata.locked) return
    const current: WidgetScaleState = w.collapsed ? 'pill' : w.iconified ? 'icon' : 'full'
    if (current === target) return
    pushHistory()
    set((state) => {
      const widgets = withWidget(state.widgets, id, (widget) => {
        // The size to restore on expand: stash it when leaving full state,
        // carry it through pill↔icon hops.
        const expandedSize =
          widget.collapsed || widget.iconified ? widget.expandedSize : widget.size
        if (target === 'full') {
          return {
            ...widget,
            collapsed: false,
            iconified: false,
            size: expandedSize ?? widget.size,
            expandedSize: undefined,
          }
        }
        if (target === 'pill') {
          return {
            ...widget,
            collapsed: true,
            iconified: false,
            expandedSize,
            size: pillSizeForTitle(widget.title),
          }
        }
        return {
          ...widget,
          collapsed: false,
          iconified: true,
          expandedSize,
          size: { ...ICONIFIED_SIZE },
        }
      })
      // Expanding can overlap neighbours — reuse the settle pass.
      return { widgets: target === 'full' ? settleWidgetLayout(widgets, [id]) : widgets }
    })
  },

  setWidgetsCollapsed: (ids, collapsed) => {
    const validIds = uniqueExistingIds(ids, get().widgets)
    if (
      validIds.length === 0 ||
      !validIds.some((id) => get().widgets[id]?.collapsed !== collapsed)
    ) {
      return
    }
    pushHistory()
    set((state) => {
      let widgets = state.widgets
      const toSettle: string[] = []
      for (const id of validIds) {
        const w = widgets[id]
        if (!w || w.collapsed === collapsed) continue
        if (collapsed) {
          widgets = withWidget(widgets, id, (widget) => ({
            ...widget,
            collapsed: true,
            iconified: false,
            expandedSize: widget.iconified ? widget.expandedSize : widget.size,
            size: pillSizeForTitle(widget.title),
          }))
        } else {
          widgets = withWidget(widgets, id, (widget) => ({
            ...widget,
            collapsed: false,
            iconified: false,
            size: widget.expandedSize ?? widget.size,
            expandedSize: undefined,
          }))
          toSettle.push(id)
        }
      }
      if (widgets === state.widgets) return state
      return { widgets: toSettle.length > 0 ? settleWidgetLayout(widgets, toSettle) : widgets }
    })
  },

  updateWidgetData: (widgetId, data) => {
    const previous = get().widgets[widgetId]
    if (!previous) return
    if (previous.type === 'checklist') {
      const before = (previous.data as ChecklistData).items.filter((item) => item.done).length
      const after = (data as ChecklistData).items.filter((item) => item.done).length
      if (after > before) void import('../utils/feedbackSound').then(({ playCompletionTick }) => playCompletionTick())
    }
    pushHistory(`data:${widgetId}`)
    set((state) => {
      const w = state.widgets[widgetId]
      if (!w) return state
      const newHeight = computeDataHeight(w.type, data)
      // A collapsed pill keeps its size; content growth lands on the stored
      // expanded size so the card is right when it reopens.
      let widgets: Record<string, Widget>
      if (w.collapsed || w.iconified) {
        const expandedSize =
          newHeight > 0 && w.expandedSize && newHeight !== w.expandedSize.height
            ? { ...w.expandedSize, height: newHeight }
            : w.expandedSize
        widgets = { ...state.widgets, [widgetId]: { ...w, data, expandedSize } }
      } else {
        const size =
          newHeight > 0 && newHeight !== w.size.height ? { ...w.size, height: newHeight } : w.size
        widgets = { ...state.widgets, [widgetId]: { ...w, data, size } }
        if (size !== w.size) widgets = settleWidgetLayout(widgets, [widgetId])
      }

      return { widgets }
    })
  },

  updateWidgetTitle: (widgetId, title) => {
    if (!get().widgets[widgetId] || get().widgets[widgetId]?.title === title) return
    pushHistory(`title:${widgetId}`)
    set((state) => {
      const widget = state.widgets[widgetId]
      if (!widget || widget.title === title) return state
      // Renaming a canvas node renames the canvas it opens.
      let canvases = state.canvases
      if (widget.type === 'canvas_node') {
        const canvasId = (widget.data as CanvasNodeData).canvasId
        const canvas = state.canvases[canvasId]
        if (canvas && canvas.name !== title) {
          canvases = { ...state.canvases, [canvasId]: { ...canvas, name: title } }
        }
      }
      return {
        widgets: withWidget(state.widgets, widgetId, (w) => ({
          ...w,
          title,
          ...(w.collapsed ? { size: pillSizeForTitle(title) } : {}),
        })),
        canvases,
      }
    })
  },

  setWidgetHydration: (widgetId, isHydrating) => {
    if (!get().widgets[widgetId]) return
    set((state) => {
      const widget = state.widgets[widgetId]
      if (!widget || widget.isHydrating === isHydrating) return state
      return {
        widgets: {
          ...state.widgets,
          [widgetId]: { ...widget, isHydrating }
        }
      }
    })
  },


  nudgeSelection: (dx, dy) => {
    const ids = [...get().selectedIds]
    if (ids.length === 0) return
    pushHistory('nudge')
    set((state) => {
      const widgets = applyWidgetDelta(state.widgets, state.relations, ids, { x: dx, y: dy })
      if (widgets === state.widgets) return state
      return { widgets: settleWidgetLayout(widgets, ids) }
    })
  },

  addRelation: (fromId, toId, type) => {
    if (fromId === toId) return ''
    const state = get()
    if (!state.widgets[fromId] || !state.widgets[toId]) return ''
    const duplicate = Object.values(state.relations).find(
      (r) => r.fromId === fromId && r.toId === toId && r.type === type,
    )
    if (duplicate) return duplicate.id
    pushHistory()
    const id = crypto.randomUUID()
    const relation: Relation = {
      id,
      fromId,
      toId,
      type,
      isResolved: type !== 'blocker' && type !== 'conflict',
    }
    set((current) => {
      const relations = { ...current.relations, [id]: relation }
      let widgets = current.widgets
      // A brand-new parent link should read as a tree edge immediately —
      // nudge the child down if it's currently closer than the minimum
      // clearance (existing drags already enforce this; this covers
      // relations drawn between two widgets that were never dragged).
      if (type === 'parent') {
        const parent = widgets[fromId]
        const child = widgets[toId]
        if (parent && child) {
          const minChildY = parent.position.y + parent.size.height + MIN_PARENT_CHILD_GAP
          if (child.position.y < minChildY) {
            widgets = settleWidgetLayout(
              {
                ...widgets,
                [toId]: { ...child, position: { ...child.position, y: snapToGrid(minChildY) } },
              },
              [toId],
            )
          }
        }
      }
      return { relations, widgets, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
    return id
  },

  toggleResolveRelation: (id) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      const rel = state.relations[id]
      if (!rel) return state
      const relations = { ...state.relations, [id]: { ...rel, isResolved: !rel.isResolved } }
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  updateRelation: (id, patch) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      const relation = state.relations[id]
      if (!relation) return state
      const relations = { ...state.relations, [id]: { ...relation, ...patch, isResolved: false } }
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  deleteRelation: (id) => {
    if (!get().relations[id]) return
    pushHistory()
    set((state) => {
      if (!state.relations[id]) return state
      const relations = { ...state.relations }
      delete relations[id]
      return { relations, blockedWidgetIds: computeBlockedWidgetIds(relations) }
    })
  },

  toggleCriticalPath: () =>
    set((state) => ({ criticalPathVisible: !state.criticalPathVisible })),

  addConnection: (draft) => {
    const state = get()
    if (draft.fromId === draft.toId) return null
    const source = state.widgets[draft.fromId]
    const target = state.widgets[draft.toId]
    if (!source || !target) return null
    // The wire's endpoints must exist in the field registry: a readable
    // source field, and a settable target field or a real command.
    if (!fieldDescriptor(source.type, draft.fromField)) return null
    if (draft.kind === 'value') {
      const targetField = draft.toField ? fieldDescriptor(target.type, draft.toField) : undefined
      if (!targetField?.set) return null
    } else if (!commandsFor(target.type).some((command) => command.key === draft.command)) {
      return null
    }
    // A trigger wire identical to an existing one is a no-op re-draw.
    if (draft.kind === 'trigger') {
      for (const existing of Object.values(state.connections)) {
        if (
          existing.kind === 'trigger' &&
          existing.fromId === draft.fromId &&
          existing.fromField === draft.fromField &&
          existing.toId === draft.toId &&
          existing.command === draft.command
        ) {
          return existing.id
        }
      }
    }
    pushHistory()
    const id = crypto.randomUUID()
    const connection: Connection = { ...draft, id, enabled: draft.enabled ?? true }
    set((current) => {
      const connections = { ...current.connections }
      // Single-writer rule: one incoming value wire per target field.
      if (connection.kind === 'value') {
        for (const existing of Object.values(connections)) {
          if (
            existing.kind === 'value' &&
            existing.toId === connection.toId &&
            existing.toField === connection.toField
          ) {
            delete connections[existing.id]
          }
        }
      }
      connections[id] = connection
      return { connections }
    })
    return id
  },

  updateConnection: (id, patch) => {
    if (!get().connections[id]) return
    pushHistory(`connection:${id}`)
    set((state) => {
      const connection = state.connections[id]
      if (!connection) return state
      return { connections: { ...state.connections, [id]: { ...connection, ...patch } } }
    })
  },

  deleteConnection: (id) => {
    if (!get().connections[id]) return
    pushHistory()
    set((state) => {
      if (!state.connections[id]) return state
      const connections = { ...state.connections }
      delete connections[id]
      return { connections }
    })
  },

  applyWireWrites: (writes) => {
    if (writes.size === 0) return
    set((state) => {
      let widgets = state.widgets
      const resized: string[] = []
      for (const [widgetId, data] of writes) {
        const widget = widgets[widgetId]
        if (!widget || widget.data === data) continue
        if (widgets === state.widgets) widgets = { ...state.widgets }
        // Same content-height discipline as updateWidgetData: growth lands on
        // the live card, or on the stored expanded size while collapsed.
        const newHeight = computeDataHeight(widget.type, data)
        if (widget.collapsed || widget.iconified) {
          const expandedSize =
            newHeight > 0 && widget.expandedSize && newHeight !== widget.expandedSize.height
              ? { ...widget.expandedSize, height: newHeight }
              : widget.expandedSize
          widgets[widgetId] = { ...widget, data, expandedSize }
        } else {
          const size =
            newHeight > 0 && newHeight !== widget.size.height
              ? { ...widget.size, height: newHeight }
              : widget.size
          widgets[widgetId] = { ...widget, data, size }
          if (size !== widget.size) resized.push(widgetId)
        }
      }
      if (widgets === state.widgets) return state
      if (resized.length > 0) widgets = settleWidgetLayout(widgets, resized)
      return { widgets }
    })
  },

  groups: initialGroups,
  widgetGroupIndex: buildGroupIndex(initialGroups),

  createGroup: (widgetIds, label) => {
    const ids = uniqueExistingIds(widgetIds, get().widgets)
    if (ids.length < 2) return ''
    pushHistory()
    const id = crypto.randomUUID()
    const color = nextGroupColor()
    const group: WidgetGroup = { id, label: label ?? 'Group', widgetIds: [...ids], color }
    set((state) => {
      let groups = { ...state.groups }
      for (const wid of ids) {
        const existingGroupId = state.widgetGroupIndex[wid]
        if (existingGroupId && groups[existingGroupId]) {
          const existing = groups[existingGroupId]
          const remaining = existing.widgetIds.filter((w) => !ids.includes(w))
          if (remaining.length < 2) {
            delete groups[existingGroupId]
          } else {
            groups[existingGroupId] = { ...existing, widgetIds: remaining }
          }
        }
      }
      groups[id] = group
      const widgetGroupIndex = buildGroupIndex(groups)
      const compacted = applyWidgetPositions(state.widgets, compactGroupPositions(state.widgets, ids))
      return {
        widgets: settleWidgetLayout(compacted, ids, widgetGroupIndex),
        groups,
        widgetGroupIndex,
      }
    })
    useToastStore.getState().addToast(`Grouped ${ids.length} widgets`)
    return id
  },

  dissolveGroup: (groupId) => {
    if (!get().groups[groupId]) return
    pushHistory()
    set((state) => {
      if (!state.groups[groupId]) return state
      const groups = { ...state.groups }
      delete groups[groupId]
      return { groups, widgetGroupIndex: buildGroupIndex(groups) }
    })
  },

  renameGroup: (groupId, label) => {
    if (!get().groups[groupId] || get().groups[groupId]?.label === label) return
    pushHistory(`rename-group:${groupId}`)
    set((state) => {
      const g = state.groups[groupId]
      if (!g || g.label === label) return state
      return { groups: { ...state.groups, [groupId]: { ...g, label } } }
    })
  },

  compactGroup: (groupId) => {
    if (!get().groups[groupId]) return
    pushHistory()
    set((state) => {
      const group = state.groups[groupId]
      if (!group || group.widgetIds.length < 2) return state
      const compacted = applyWidgetPositions(
        state.widgets,
        compactGroupPositions(state.widgets, group.widgetIds),
      )
      return { widgets: settleWidgetLayout(compacted, group.widgetIds) }
    })
  },

  addToGroup: (groupId, widgetId) => {
    const existing = get().groups[groupId]
    if (!existing || existing.widgetIds.includes(widgetId)) return
    pushHistory()
    set((state) => {
      const g = state.groups[groupId]
      if (!g || g.widgetIds.includes(widgetId)) return state
      let groups = { ...state.groups }
      const existingGroupId = state.widgetGroupIndex[widgetId]
      if (existingGroupId && existingGroupId !== groupId && groups[existingGroupId]) {
        const existing = groups[existingGroupId]
        const remaining = existing.widgetIds.filter((w) => w !== widgetId)
        if (remaining.length < 2) delete groups[existingGroupId]
        else groups[existingGroupId] = { ...existing, widgetIds: remaining }
      }
      const widgetIds = [...g.widgetIds, widgetId]
      groups[groupId] = { ...g, widgetIds }
      const widgetGroupIndex = buildGroupIndex(groups)
      const compacted = applyWidgetPositions(state.widgets, compactGroupPositions(state.widgets, widgetIds))
      return {
        widgets: settleWidgetLayout(compacted, widgetIds, widgetGroupIndex),
        groups,
        widgetGroupIndex,
      }
    })
  },

  joinGroup: (groupId, widgetId) => {
    const state = get()
    const g = state.groups[groupId]
    if (!g || g.widgetIds.includes(widgetId)) return
    set((s) => {
      const group = s.groups[groupId]
      if (!group || group.widgetIds.includes(widgetId)) return s
      const groups = { ...s.groups, [groupId]: { ...group, widgetIds: [...group.widgetIds, widgetId] } }
      return { groups, widgetGroupIndex: buildGroupIndex(groups) }
    })
    useToastStore.getState().addToast(`Added to "${g.label}"`)
  },

  dragOverGroupId: null,
  setDragOverGroupId: (id) =>
    set((state) => (state.dragOverGroupId === id ? state : { dragOverGroupId: id })),

  hoveredWidgetId: null,
  setHoveredWidgetId: (id) =>
    set((state) => (state.hoveredWidgetId === id ? state : { hoveredWidgetId: id })),

  removeFromGroup: (groupId, widgetId) => {
    if (!get().groups[groupId]) return
    pushHistory()
    set((state) => {
      const g = state.groups[groupId]
      if (!g) return state
      const remaining = g.widgetIds.filter((w) => w !== widgetId)
      const groups = { ...state.groups }
      if (remaining.length < 2) delete groups[groupId]
      else groups[groupId] = { ...g, widgetIds: remaining }

      const peeledPosition = detachPosition(state.widgets, g.widgetIds, widgetId)
      const widgets = peeledPosition
        ? settleWidgetLayout(
            applyWidgetPositions(state.widgets, { [widgetId]: peeledPosition }),
            [widgetId],
          )
        : state.widgets

      return {
        widgets,
        groups,
        widgetGroupIndex: buildGroupIndex(groups),
      }
    })
  },

  moveGroup: (groupId, screenDelta, zoom) => {
    const safeZoom = zoom > 0 ? zoom : 1
    set((state) => {
      const g = state.groups[groupId]
      if (!g) return state
      const widgets = applyWidgetDelta(
        state.widgets,
        state.relations,
        g.widgetIds,
        { x: screenDelta.x / safeZoom, y: screenDelta.y / safeZoom },
      )
      return widgets === state.widgets ? state : { widgets }
    })
  },

  selectedIds: new Set<string>(),

  selectWidget: (id, additive) => {
    set((state) => {
      if (!state.widgets[id]) return state
      if (additive) {
        const next = new Set(state.selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedIds: next }
      }
      if (state.selectedIds.size === 1 && state.selectedIds.has(id)) return state
      return { selectedIds: new Set([id]) }
    })
  },

  selectWidgets: (ids) => {
    set((state) => {
      const next = new Set(uniqueExistingIds(ids, state.widgets))
      if (next.size === state.selectedIds.size && [...next].every((id) => state.selectedIds.has(id))) {
        return state
      }
      return { selectedIds: next }
    })
  },

  clearSelection: () => {
    set((state) =>
      state.selectedIds.size === 0 ? state : { selectedIds: new Set<string>() },
    )
  },

  deleteWidget: (id) => {
    get().deleteWidgets([id])
  },

  deleteWidgets: (ids) => {
    const deletableIds = uniqueExistingIds(ids, get().widgets).filter(
      (id) => !get().widgets[id]?.metadata.locked,
    )
    const deletedCount = deletableIds.length
    if (deletedCount === 0) return
    pushHistory()
    set((state) => {
      const deletedIds = new Set(deletableIds)
      if (deletedIds.size === 0) return state

      // Cascade: deleting a canvas node deletes its canvas, everything on it,
      // and recursively any canvases nested deeper down that branch.
      const removedCanvasIds = new Set<string>()
      const canvasQueue: string[] = []
      for (const id of deletedIds) {
        const widget = state.widgets[id]
        if (widget?.type === 'canvas_node') {
          const canvasId = (widget.data as CanvasNodeData).canvasId
          if (state.canvases[canvasId] && !removedCanvasIds.has(canvasId)) {
            removedCanvasIds.add(canvasId)
            canvasQueue.push(canvasId)
          }
        }
      }
      while (canvasQueue.length > 0) {
        const parentId = canvasQueue.pop()!
        for (const canvas of Object.values(state.canvases)) {
          if (canvas.parentCanvasId === parentId && !removedCanvasIds.has(canvas.id)) {
            removedCanvasIds.add(canvas.id)
            canvasQueue.push(canvas.id)
          }
        }
      }

      const widgets: Record<string, Widget> = {}
      for (const [id, widget] of Object.entries(state.widgets)) {
        if (deletedIds.has(id) || removedCanvasIds.has(widget.canvasId)) continue
        widgets[id] = widget
      }

      let canvases = state.canvases
      let canvasViews = state.canvasViews
      if (removedCanvasIds.size > 0) {
        canvases = { ...state.canvases }
        canvasViews = { ...state.canvasViews }
        for (const id of removedCanvasIds) {
          delete canvases[id]
          delete canvasViews[id]
        }
      }

      const relations: Record<string, Relation> = {}
      for (const [relationId, relation] of Object.entries(state.relations)) {
        if (!widgets[relation.fromId] || !widgets[relation.toId]) continue
        relations[relationId] = relation
      }

      let connections = state.connections
      for (const connection of Object.values(state.connections)) {
        if (widgets[connection.fromId] && widgets[connection.toId]) continue
        if (connections === state.connections) connections = { ...state.connections }
        delete connections[connection.id]
      }

      const groups: Record<string, WidgetGroup> = {}
      for (const [groupId, group] of Object.entries(state.groups)) {
        const widgetIds = group.widgetIds.filter((id) => widgets[id])
        if (widgetIds.length >= 2) groups[groupId] = { ...group, widgetIds }
      }

      const selectedIds = new Set(
        [...state.selectedIds].filter((id) => widgets[id]),
      )

      return {
        widgets,
        widgetStructureVersion: state.widgetStructureVersion + 1,
        canvases,
        canvasViews,
        relations,
        connections,
        groups,
        widgetGroupIndex: buildGroupIndex(groups),
        selectedIds,
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        contextMenu:
          state.contextMenu && deletedIds.has(state.contextMenu.widgetId)
            ? null
            : state.contextMenu,
      }
    })
    useToastStore.getState().addToast(
      deletedCount === 1 ? 'Deleted widget' : `Deleted ${deletedCount} widgets`,
      { action: { label: 'Undo', run: () => get().undo() } },
    )
  },

  duplicateWidget: (id) => {
    const state = get()
    const source = state.widgets[id]
    if (!source) return ''
    pushHistory()
    const nextId = crypto.randomUUID()
    const clone: Widget = {
      ...source,
      id: nextId,
      title: `${source.title} copy`,
      position: {
        x: snapToGrid(source.position.x + GRID_SIZE),
        y: snapToGrid(source.position.y + GRID_SIZE),
      },
      data: structuredClone(source.data),
      metadata: structuredClone(source.metadata),
    }
    // A duplicated canvas node opens a fresh empty canvas of the same name —
    // two nodes must never share one backing canvas.
    let newCanvas: CanvasMeta | null = null
    if (clone.type === 'canvas_node') {
      const subCanvasId = crypto.randomUUID()
      newCanvas = {
        id: subCanvasId,
        name: clone.title,
        workspaceId: state.activeWorkspaceId,
        parentCanvasId: source.canvasId,
      }
      clone.data = { canvasId: subCanvasId }
    }
    set((current) => ({
      widgets: settleWidgetLayout({ ...current.widgets, [nextId]: clone }, [nextId]),
      widgetStructureVersion: current.widgetStructureVersion + 1,
      selectedIds: new Set([nextId]),
      contextMenu: null,
      ...(newCanvas ? { canvases: { ...current.canvases, [newCanvas.id]: newCanvas } } : {}),
    }))
    markSpawned(nextId)
    return nextId
  },

  duplicateWidgets: (ids) => {
    const state = get()
    const validIds = uniqueExistingIds(ids, state.widgets)
    if (validIds.length === 0) return []
    pushHistory()

    const clones: Widget[] = []
    const newCanvases: CanvasMeta[] = []
    for (const id of validIds) {
      const source = state.widgets[id]!
      const clone: Widget = {
        ...source,
        id: crypto.randomUUID(),
        title: `${source.title} copy`,
        position: {
          x: snapToGrid(source.position.x + GRID_SIZE),
          y: snapToGrid(source.position.y + GRID_SIZE),
        },
        data: structuredClone(source.data),
        metadata: structuredClone(source.metadata),
      }
      if (clone.type === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        newCanvases.push({
          id: subCanvasId,
          name: clone.title,
          workspaceId: state.activeWorkspaceId,
          parentCanvasId: source.canvasId,
        })
        clone.data = { canvasId: subCanvasId }
      }
      clones.push(clone)
    }

    const newIds = clones.map((clone) => clone.id)
    // Wires fully inside the duplicated set travel with it — a wired cluster
    // duplicates as a working circuit, not a pile of disconnected cards.
    const cloneIdBySource = new Map(validIds.map((id, index) => [id, newIds[index]!]))
    set((current) => {
      const widgets = { ...current.widgets }
      for (const clone of clones) widgets[clone.id] = clone
      let canvases = current.canvases
      if (newCanvases.length > 0) {
        canvases = { ...current.canvases }
        for (const canvas of newCanvases) canvases[canvas.id] = canvas
      }
      let connections = current.connections
      for (const connection of Object.values(current.connections)) {
        const fromClone = cloneIdBySource.get(connection.fromId)
        const toClone = cloneIdBySource.get(connection.toId)
        if (!fromClone || !toClone) continue
        if (connections === current.connections) connections = { ...current.connections }
        const id = crypto.randomUUID()
        connections[id] = { ...connection, id, fromId: fromClone, toId: toClone }
      }
      return {
        widgets: settleWidgetsByCanvas(widgets, newIds),
        widgetStructureVersion: current.widgetStructureVersion + 1,
        selectedIds: new Set(newIds),
        contextMenu: null,
        canvases,
        connections,
      }
    })
    for (const id of newIds) markSpawned(id)
    useToastStore.getState().addToast(
      newIds.length === 1 ? 'Duplicated 1 widget' : `Duplicated ${newIds.length} widgets`,
    )
    return newIds
  },

  pasteWidgets: (sources) => {
    if (sources.length === 0) return []
    pushHistory()
    const offset = { x: GRID_SIZE * 2, y: GRID_SIZE * 2 }
    const activeCanvasId = get().activeCanvasId
    const activeWorkspaceId = get().activeWorkspaceId
    const newCanvases: CanvasMeta[] = []
    const clones: Widget[] = sources.map((src) => {
      const clone: Widget = {
        ...src,
        id: crypto.randomUUID(),
        canvasId: activeCanvasId,
        position: {
          x: snapToGrid(src.position.x + offset.x),
          y: snapToGrid(src.position.y + offset.y),
        },
        data: structuredClone(src.data),
        metadata: structuredClone(src.metadata),
      }
      // Pasted canvas nodes get fresh empty backing canvases.
      if (clone.type === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        newCanvases.push({
          id: subCanvasId,
          name: clone.title,
          workspaceId: activeWorkspaceId,
          parentCanvasId: activeCanvasId,
        })
        clone.data = { canvasId: subCanvasId }
      }
      return clone
    })
    const cloneIds = clones.map((c) => c.id)
    set((state) => {
      const next = { ...state.widgets }
      for (const clone of clones) next[clone.id] = clone
      let canvases = state.canvases
      if (newCanvases.length > 0) {
        canvases = { ...state.canvases }
        for (const canvas of newCanvases) canvases[canvas.id] = canvas
      }
      return {
        widgets: settleWidgetsByCanvas(next, cloneIds),
        widgetStructureVersion: state.widgetStructureVersion + 1,
        selectedIds: new Set(cloneIds),
        canvases,
      }
    })
    for (const clone of clones) markSpawned(clone.id)
    useToastStore.getState().addToast(
      clones.length === 1 ? 'Pasted 1 widget' : `Pasted ${clones.length} widgets`,
    )
    return cloneIds
  },

  renamingWidgetId: null,
  startRenaming: (id) => {
    if (!get().widgets[id] || get().renamingWidgetId === id) return
    set({ renamingWidgetId: id })
  },
  stopRenaming: () =>
    set((state) => (state.renamingWidgetId ? { renamingWidgetId: null } : state)),

  toggleWidgetLocked: (widgetId) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => ({
        ...widget,
        metadata: { ...widget.metadata, locked: !widget.metadata.locked },
      })),
    }))
  },

  setWidgetAccent: (widgetId, accent) => {
    if (!get().widgets[widgetId]) return
    pushHistory()
    set((state) => ({
      widgets: withWidget(state.widgets, widgetId, (widget) => ({
        ...widget,
        metadata: { ...widget.metadata, accent },
      })),
    }))
  },

  bringWidgetToFront: (widgetId) => {
    set((state) => {
      if (!state.widgets[widgetId]) return state
      const top = Math.max(0, ...Object.values(state.widgets).map((item) => item.metadata.zIndex ?? 0)) + 1
      return {
        widgets: withWidget(state.widgets, widgetId, (item) => ({
          ...item,
          metadata: { ...item.metadata, zIndex: top },
        })),
      }
    })
  },

  contextMenu: null,
  openContextMenu: (widgetId, x, y) => {
    set((state) =>
      state.widgets[widgetId] ? { contextMenu: { widgetId, x, y } } : state,
    )
  },
  closeContextMenu: () => {
    set((state) => (state.contextMenu ? { contextMenu: null } : state))
  },

  addWidgetAt: null,
  addWidgetView: 'widgets',
  openAddWidget: (worldPos, view = 'widgets') =>
    set({ addWidgetAt: worldPos, addWidgetView: view }),
  closeAddWidget: () => {
    set((state) => (state.addWidgetAt ? { addWidgetAt: null } : state))
  },

  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) =>
    set((state) => (state.shortcutsOpen === shortcutsOpen ? state : { shortcutsOpen })),

  importOpen: false,
  setImportOpen: (importOpen) =>
    set((state) => (state.importOpen === importOpen ? state : { importOpen })),

  importMindmap: (widgets, groups, relations) => {
    pushHistory()
    set((state) => {
      const nextWidgets = { ...state.widgets, ...widgets }
      const nextGroups = { ...state.groups, ...groups }
      
      const nextRelations = { ...state.relations }
      relations.forEach((r) => {
        nextRelations[r.id] = r
      })

      const nextWidgetGroupIndex = { ...state.widgetGroupIndex }
      Object.entries(groups).forEach(([groupId, g]) => {
        g.widgetIds.forEach((wid) => {
          nextWidgetGroupIndex[wid] = groupId
        })
      })

      return {
        widgets: nextWidgets,
        widgetStructureVersion: state.widgetStructureVersion + 1,
        groups: nextGroups,
        relations: nextRelations,
        widgetGroupIndex: nextWidgetGroupIndex,
      }
    })
  },



  quickAddOpen: false,
  setQuickAddOpen: (quickAddOpen) =>
    set((state) => (state.quickAddOpen === quickAddOpen ? state : { quickAddOpen })),

  activePacks: initialPacks,
  togglePack: (pack) =>
    set((state) => ({
      activePacks: state.activePacks.includes(pack)
        ? state.activePacks.filter((p) => p !== pack)
        : [...state.activePacks, pack],
    })),

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) =>
    set((state) => (state.paletteOpen === paletteOpen ? state : { paletteOpen })),

  searchWidgets: (query) => {
    if (!query.trim()) return []
    const { widgets, canvases, activeWorkspaceId, activeCanvasId } = get()
    const results: SearchResult[] = []
    for (const w of Object.values(widgets)) {
      const canvas = canvases[w.canvasId]
      if (!canvas || canvas.workspaceId !== activeWorkspaceId) continue
      const titleScore = fuzzyScore(query, w.title)
      const typeScore = fuzzyScore(query, MODULE_LABELS[w.type])
      if (Math.max(titleScore, typeScore) === 0) continue
      const onOtherCanvas = w.canvasId !== activeCanvasId
      results.push({
        id: w.id,
        type: 'widget',
        title: w.title,
        subtitle: onOtherCanvas
          ? `${MODULE_LABELS[w.type]} · ${canvas.name}`
          : MODULE_LABELS[w.type],
        canvasId: w.canvasId,
        position: {
          x: w.position.x + w.size.width / 2,
          y: w.position.y + w.size.height / 2,
        },
      })
    }
    return results.sort((a, b) => fuzzyScore(query, b.title) - fuzzyScore(query, a.title))
  },

  linkDrag: null,
  startLinkDrag: (sourceId, cursorWorld, dropScreen) =>
    set({ linkDrag: { sourceId, cursorWorld, dropScreen } }),
  updateLinkDragCursor: (cursorWorld, dropScreen) =>
    set((state) =>
      state.linkDrag ? { linkDrag: { ...state.linkDrag, cursorWorld, dropScreen } } : state,
    ),
  endLinkDrag: (targetId) => {
    const { linkDrag } = get()
    if (!linkDrag) return
    set({ linkDrag: null })
    if (!targetId || targetId === linkDrag.sourceId) return
    const state = get()
    const source = state.widgets[linkDrag.sourceId]
    const target = state.widgets[targetId]
    if (!source || !target) return
    // Whichever widget sits higher on the canvas becomes the parent —
    // no picker, the drop position alone decides the relation.
    const sourceCenterY = source.position.y + source.size.height / 2
    const targetCenterY = target.position.y + target.size.height / 2
    const [parentId, childId] =
      sourceCenterY <= targetCenterY
        ? [linkDrag.sourceId, targetId]
        : [targetId, linkDrag.sourceId]
    state.addRelation(parentId, childId, 'parent')
  },

  childLinkSource: null,
  startChildLink: (sourceId) =>
    set((state) => (
      state.childLinkSource === sourceId && state.dependencyLinkSource === null
        ? state
        : { childLinkSource: sourceId, dependencyLinkSource: null }
    )),
  clearChildLink: () =>
    set((state) => (state.childLinkSource === null ? state : { childLinkSource: null })),

  dependencyLinkSource: null,
  startDependencyLink: (sourceId) =>
    set((state) => (
      state.dependencyLinkSource === sourceId && state.childLinkSource === null
        ? state
        : { dependencyLinkSource: sourceId, childLinkSource: null }
    )),
  clearDependencyLink: () =>
    set((state) => (state.dependencyLinkSource === null ? state : { dependencyLinkSource: null })),

  ghostConfig: null,

  startGhostShaper: (worldX, worldY) => {
    ghostGestureBase = null
    ghostGestureIds.clear()
    const originX = snapToGrid(worldX)
    const originY = snapToGrid(worldY)
    set({
      ghostConfig: {
        isActive: true,
        originX,
        originY,
        nodes: [{ id: crypto.randomUUID(), parentId: null, order: 0, x: originX, y: originY }],
      },
    })
  },

  beginGhostGesture: () => {
    const config = get().ghostConfig
    ghostGestureBase = config?.nodes.map((node) => ({ ...node })) ?? null
    ghostGestureIds.clear()
  },

  shapeGhostTree: (nodeId, direction, steps) => {
    const config = get().ghostConfig
    const base = ghostGestureBase ?? config?.nodes
    if (!config || !base?.some((node) => node.id === nodeId)) return
    let nodes = base.map((candidate) => ({ ...candidate }))
    if (steps === 0) {
      set({ ghostConfig: { ...config, nodes: layoutGhostTree(nodes, config.originX, config.originY) } })
      return
    }
    const removeSubtree = (rootId: string) => {
      const remove = new Set([rootId])
      for (let cursor = 0; cursor < nodes.length; cursor++) {
        const candidate = nodes[cursor]!
        if (candidate.parentId && remove.has(candidate.parentId)) remove.add(candidate.id)
      }
      nodes = nodes.filter((candidate) => !remove.has(candidate.id))
    }

    if (direction === 'down') {
      let parent = nodes.find((candidate) => candidate.id === nodeId)
      while (parent) {
        const center = nodes.find((candidate) => candidate.parentId === parent!.id && candidate.order === 0)
        if (!center) break
        parent = center
      }
      for (let step = 0; step < steps && parent; step++) {
        const child: GhostTreeNode = {
          id: gestureGhostId(`down:${nodeId}:${step}`),
          parentId: parent.id,
          order: 0,
          x: parent.x,
          y: parent.y + GHOST_PITCH_Y,
        }
        nodes.push(child)
        parent = child
      }
    } else if (direction === 'up') {
      for (let step = 0; step < steps; step++) {
        const reference = nodes.find((candidate) => candidate.id === nodeId)
        if (!reference) break
        let frontier = nodes.filter((candidate) => candidate.parentId === reference.id)
        let deepest: GhostTreeNode | undefined
        while (frontier.length > 0) {
          deepest = frontier.sort((a, b) => Math.abs(b.order) - Math.abs(a.order))[0]
          frontier = nodes.filter((candidate) => candidate.parentId === deepest!.id)
        }
        if (deepest) removeSubtree(deepest.id)
        else if (reference.parentId) removeSubtree(reference.id)
      }
    } else {
      const reference = nodes.find((candidate) => candidate.id === nodeId)
      if (!reference) return
      const parent = reference.parentId
        ? nodes.find((candidate) => candidate.id === reference.parentId)
        : reference
      if (!parent) return
      const gestureSide = direction === 'left' ? -1 : 1
      const outward = reference.parentId === null || reference.order === 0 || Math.sign(reference.order) === gestureSide
      // Inward motion edits the side the grabbed node actually belongs to;
      // using cursor direction here would delete the opposite sibling set.
      const side = outward ? gestureSide : Math.sign(reference.order)
      for (let step = 0; step < steps; step++) {
        const siblings = nodes.filter((candidate) => candidate.parentId === parent.id)
        const onSide = siblings.filter((candidate) => Math.sign(candidate.order) === side)
        if (outward) {
          if (onSide.length >= GHOST_SIBLINGS_PER_SIDE_MAX) break
          const order = side < 0
            ? Math.min(0, ...onSide.map((candidate) => candidate.order)) - 1
            : Math.max(0, ...onSide.map((candidate) => candidate.order)) + 1
          nodes.push({
            id: gestureGhostId(`side:${parent.id}:${order}`),
            parentId: parent.id,
            order,
            x: parent.x,
            y: parent.y + GHOST_PITCH_Y,
          })
        } else {
          const outermost = onSide.sort((a, b) => Math.abs(b.order) - Math.abs(a.order))[0]
          if (!outermost) break
          removeSubtree(outermost.id)
        }
      }
    }

    nodes = layoutGhostTree(nodes, config.originX, config.originY)
    set({ ghostConfig: { ...config, nodes } })
  },

  endGhostGesture: () => {
    ghostGestureBase = null
    ghostGestureIds.clear()
  },

  cancelGhostShaper: () =>
    set((state) => {
      ghostGestureBase = null
      ghostGestureIds.clear()
      return state.ghostConfig === null ? state : { ghostConfig: null }
    }),

  commitGhostTree: () => {
    const state = get()
    const config = state.ghostConfig
    if (!config) return
    const { originX, originY, nodes } = config
    pushHistory()

    const widgets = { ...state.widgets }
    const relations = { ...state.relations }
    const created: string[] = []
    const settleIds = new Set<string>()
    const relationKeys = new Set(
      Object.values(relations).map((relation) =>
        relationKey(relation.fromId, relation.toId, relation.type),
      ),
    )
    const createNote = (title: string, position: Vector2D) => {
      const id = crypto.randomUUID()
      widgets[id] = buildWidget(id, 'notes', title, state.activeCanvasId, position)
      created.push(id)
      settleIds.add(id)
      return id
    }

    const ids = new Map<string, string>()
    for (const node of nodes) {
        const childId = createNote(node.parentId === null ? 'Root' : 'Branch', {
          x: originX + (node.x - originX) * 3,
          y: originY + (node.y - originY) * 2.5,
        })
        ids.set(node.id, childId)
    }
    for (const node of nodes) {
      if (node.parentId) {
        const parentId = ids.get(node.parentId)
        const childId = ids.get(node.id)
        if (parentId && childId) {
        appendDraftRelation(
          widgets,
          relations,
          relationKeys,
          settleIds,
          parentId,
          childId,
          'parent',
        )
        }
      }
    }

    set({
      widgets: settleWidgetsByCanvas(widgets, settleIds),
      widgetStructureVersion: state.widgetStructureVersion + 1,
      relations,
      blockedWidgetIds: computeBlockedWidgetIds(relations),
      ghostConfig: null,
    })
    for (const id of created) markSpawned(id)
  },
  }
})
