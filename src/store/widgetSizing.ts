import type {
  BarChartData, BudgetData,
  CitationData, CodeData, DecisionData, DecisionMatrixData,
  FormWidgetData, FormulaSheetData, GoalTrackerData, GradeCalcData,
  InventoryData, LinksData, LogbookData,
  MeetingNotesData, MetricsData, ModuleData, ModuleType, OutlineData,
  PollData, ProcessData, ProsConsData, ReadingListData,
  RiskRegisterData, Size, SwotData, TableData, TimesheetData, 
  Vector2D, Widget, 
} from '../types/spatial'
import { GRID_SIZE, snapToGrid } from '../types/spatial'
import { widgetDefinition } from '../widgets/registry'
import { clamp } from '../utils/math'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH } from './widgetLayoutConstants'

/**
 * Meeting Notes skins, as [per-action height, fixed chrome] in CSS pixels.
 * Chrome is each skin's measured empty height plus the card's content inset —
 * a stand-up carries three lanes and a retro four quadrants before a single
 * action exists, so one shared constant put both into a scroller on creation.
 */
const MEETING_SKIN_METRICS: Record<string, readonly [number, number]> = {
  agenda: [64, 282],
  minutes: [62, 296],
  stand_up: [30, 354],
  retrospective: [30, 396],
  one_to_one: [32, 334],
  decision_review: [92, 282],
  handoff: [30, 344],
}

/** Poll skins, as [per-option height, fixed chrome] in CSS pixels. */
const POLL_SKIN_METRICS: Record<string, readonly [number, number]> = {
  bars: [46, 120],
  donut: [26, 190],
  approval: [38, 158],
  // Below 380px the ballot and its runoff stack, so each option costs a
  // ranking row and a runoff line in every round it survives.
  ranked_choice: [46, 260],
  pairwise: [24, 250],
  live_room: [34, 190],
  anonymous: [34, 176],
}

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
      // Each skin stacks a different amount of fixed chrome above the options:
      // a dial and legend, a cast bar, a runoff column, a duel plus its matrix.
      const [perOption, chrome] = POLL_SKIN_METRICS[d.skin ?? 'bars'] ?? POLL_SKIN_METRICS.bars!
      return Math.max(C * 4, Math.ceil((d.options.length * perOption + chrome) / C) * C)
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
      // Balance and the weighted dial stack two columns side by side, so only
      // the taller column sets the height. Debate stacks every exchange, and
      // Red Team gives each failure mode an evidence line of its own.
      const skin = d.skin ?? 'balance'
      if (skin === 'debate') {
        const exchanges = d.pros.length + Math.max(0, d.cons.length - d.pros.length)
        return Math.max(C * 5, Math.ceil((exchanges * 96 + 132) / C) * C)
      }
      if (skin === 'red_team') {
        return Math.max(C * 5, Math.ceil((d.cons.length * 62 + d.pros.length * 8 + 132) / C) * C)
      }
      if (skin === 'reversible_irreversible') {
        // Either lane can hold every point, so the taller case is all of them.
        const points = d.pros.length + d.cons.length
        return Math.max(C * 5, Math.ceil((points * 30 + 168) / C) * C)
      }
      const rows = Math.max(d.pros.length, d.cons.length)
      const rowHeight = skin === 'weighted_trade_off' ? 32 : 28
      return Math.max(C * 4, Math.ceil((rows * rowHeight + 148) / C) * C)
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
      // Each skin spends its height differently: a decision carries a rationale
      // and two chips, a stand-up ask is a single line under three lanes. This
      // is the creation-time estimate only — the renderer reports its real
      // height once mounted.
      const [rowHeight, chrome] = MEETING_SKIN_METRICS[d.skin ?? 'agenda']
        ?? MEETING_SKIN_METRICS.agenda!
      return Math.max(C * 6, Math.ceil((d.actions.length * rowHeight + chrome) / C) * C)
    }
    case 'decision': {
      const d = data as DecisionData
      return Math.max(C * 4, Math.ceil((d.options.length * 28 + 152) / C) * C)
    }
    case 'code': {
      const d = data as CodeData
      const lines = d.code.split('\n').length
      return Math.max(C * 4, Math.ceil((lines * 18 + 96) / C) * C)
    }
    case 'grade_calc': {
      const d = data as GradeCalcData
      const rowCount = d.mode === 'gpa'
        ? (d.gpa?.courses.length ?? 1)
        : d.components.length
      return Math.max(C * 4, Math.ceil((rowCount * 36 + 154) / C) * C)
    }
    case 'formula_sheet': {
      // Each skin stacks the same formulas differently, so each needs its own
      // height. Only counts are read here — what the rows MEAN is the skin
      // model's business, and sizing must not need to load it.
      const d = data as FormulaSheetData
      const count = d.formulas.length
      // Measured from the rendered card: heading, footer, gaps and padding.
      // Where a skin can lay out in columns the single-column height is used,
      // because slack at the bottom is a far smaller sin than a clipped row.
      const chrome = 112
      if (d.skin === 'equation_cards') {
        // One equation per row at the card's own width, which is the point of
        // the skin; a widened card packs them and simply gains slack.
        return Math.max(C * 5, Math.ceil((count * 106 + chrome) / C) * C)
      }
      if (d.skin === 'exam_strip') {
        // Two packed columns at the card's own width. Under-shooting only ever
        // costs a scroll here, and a cheat sheet that wastes a page is worse.
        return Math.max(C * 4, Math.ceil((Math.ceil(count / 2) * 42 + chrome) / C) * C)
      }
      if (d.skin === 'derivation') {
        const steps = d.skinStates?.derivation?.steps
        const stepRows = steps && typeof steps === 'object' && !Array.isArray(steps)
          ? Object.values(steps as Record<string, unknown>)
            .reduce((total: number, list) => total + (Array.isArray(list) ? list.length : 0), 0)
          : 0
        return Math.max(C * 5, Math.ceil((count * 104 + stepRows * 26 + chrome) / C) * C)
      }
      if (d.skin === 'unit_aware') {
        // Measured against a five-symbol formula, whose unit grid wraps to two
        // rows. A simpler formula leaves slack rather than losing its verdict.
        return Math.max(C * 6, Math.ceil((count * 208 + chrome) / C) * C)
      }
      if (d.skin === 'worked_example') {
        const opened = typeof d.skinStates?.worked_example?.openId === 'string' ? 1 : 0
        return Math.max(C * 4, Math.ceil((count * 48 + opened * 140 + chrome) / C) * C)
      }
      return Math.max(C * 4, Math.ceil((count * 42 + chrome) / C) * C)
    }
    case 'citation': {
      const d = data as CitationData
      return Math.max(C * 4, Math.ceil((d.sources.length * 52 + 96) / C) * C)
    }
    case 'outline': {
      const d = data as OutlineData
      return Math.max(C * 4, Math.ceil((d.items.length * 30 + 80) / C) * C)
    }
    case 'form': {
      const d = data as FormWidgetData
      // Every skin stacks the same fields; they differ in how much each field
      // carries. Application adds a section and an evidence line, Inspection a
      // note, Conditional a rule row.
      const perField = d.skin === 'application'
        ? 92
        : d.skin === 'conditional_form'
          ? 76
          : d.skin === 'inspection'
            ? 68
            : 54
      const chrome = d.skin === 'rsvp' ? 236 : d.skin === 'feedback' ? 176 : 150
      return Math.max(C * 5, Math.ceil((d.fields.length * perField + chrome) / C) * C)
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
// Seed data — the blank workspace shell lives in widgetSeeds.ts.
// ---------------------------------------------------------------------------
