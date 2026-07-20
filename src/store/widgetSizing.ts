import type {
  AssignmentData, BarChartData, BudgetData,
  CitationData, CodeData, DailyAgendaData, DecisionData, DecisionMatrixData,
  FormWidgetData, FormulaSheetData, GoalTrackerData, GpaData, GradeCalcData,
  InventoryData, KanbanData, LineChartData, LinksData, LogbookData,
  MeetingNotesData, MetricsData, ModuleData, ModuleType, OutlineData,
  PieChartData, PollData, ProcessData, ProsConsData, QuizData, ReadingListData,
  RiskRegisterData, Size, SwotData, TableData, TimesheetData, VocabData,
  Vector2D, WeeklyPlannerData, Widget, WorldClockData,
} from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { CONSOLIDATED_WIDGET_MODES, publicWidgetTypeFor, widgetDefinition } from '../widgets/registry'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from './widgetLayoutConstants'

export function computeDataHeight(type: ModuleType, data: ModuleData): number {
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
export function computeDataWidth(type: ModuleType, data: ModuleData): number {
  const C = GRID_SIZE
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  switch (type) {
    case 'table': {
      const d = data as TableData
      const cols = d.rows.reduce((m, r) => Math.max(m, r.length), 0)
      if (cols === 0) return 0
      // Columns create width; cell text scrolls inside its input. A pasted URL
      // or identifier must never turn one table into a canvas-wide card.
      return clamp(snapToGrid(cols * 112 + 24), C * 5, C * 18)
    }
    case 'budget': {
      const d = data as BudgetData
      const longest = d.items.reduce((max, item) => Math.max(max, item.label.length), 0)
      // Label plus fixed amount/currency/remove affordances and card insets.
      return clamp(snapToGrid(clamp(longest * 7 + 24, 120, 360) + 152), C * 5, C * 16)
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
export function fitWidgetSize(widget: Widget): Size {
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

export function fuzzyScore(query: string, target: string): number {
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

export function buildWidget(
  id: string,
  type: ModuleType,
  title: string,
  canvasId: string,
  position: Vector2D,
  size?: Size,
): Widget {
  const publicType = publicWidgetTypeFor(type)
  const def = widgetDefinition(publicType)
  const mode = CONSOLIDATED_WIDGET_MODES[type]
  const defaults = def.defaultData()
  const data = mode ? ({ ...defaults, mode } as ModuleData) : defaults
  const dataHeight = computeDataHeight(publicType, data)
  const initialSize = size ?? {
    ...def.defaultSize,
    height: Math.max(def.defaultSize.height, dataHeight),
  }
  return {
    id,
    type: publicType,
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
