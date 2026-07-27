// ---------------------------------------------------------------------------
// Per-module data schemas
// ---------------------------------------------------------------------------

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export interface NotesData {
  text: string
  mode?:
    | 'plain'
    | 'sticky'
    | 'quote'
    | 'daily_log'
    | 'markdown_page'
    | 'typewriter'
    | 'callout'
    | 'versioned_note'
  color?: StickyNoteColor
  attribution?: string
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface BulletItem {
  id: string
  text: string
}

export interface BulletsData {
  items: BulletItem[]
  /** Presentation worn by this list. Missing means the classic dotted list. */
  skin?: 'dots' | 'numbered' | 'compact_chips' | 'two_column' | 'nested_outline' | 'rolling_log'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  status?: 'todo' | 'doing' | 'done'
  due?: string
  day?: number
  time?: string
  start?: number
  span?: number
  quadrant?: 0 | 1 | 2 | 3
}

export interface ChecklistData {
  items: ChecklistItem[]
  /** The arrangement worn by this one task collection. Missing on legacy cards. */
  mode?:
    | 'list'
    | 'inbox'
    | 'shopping'
    | 'assignments'
    | 'day'
    | 'week'
    | 'board'
    | 'timeline'
    | 'matrix'
    | 'recurring'
    | 'sprint'
    | 'dependencies'
    | 'routine'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

/** Row-major cell matrix; the first row renders as the header. */
export interface TableData {
  rows: string[][]
  /** Alternate presentations over the same row matrix. Missing on legacy cards. */
  skin?:
    | 'grid'
    | 'compact_ledger'
    | 'cards'
    | 'database'
    | 'kanban'
    | 'gallery'
    | 'form_view'
    | 'pivot'
  /** Specialist view settings stay isolated from the shared cells. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface SketchpadPoint {
  /** Normalized coordinates keep ink aligned when the widget is resized. */
  x: number
  y: number
  /** Pointer pressure normalized to 0…1. */
  pressure: number
}

export interface SketchpadStroke {
  id: string
  color: string
  /** Nominal CSS-pixel width before pressure is applied. */
  size: number
  points: readonly SketchpadPoint[]
}

export type DrawingMode =
  | 'ink'
  | 'whiteboard'
  | 'graph_paper'
  | 'dot_grid'
  | 'storyboard'
  | 'annotation'
  | 'diagram'

export interface SketchpadData {
  height: number
  /** Optional for backwards compatibility with pre-drawing Sketchpad cards. */
  strokes?: readonly SketchpadStroke[]
  /** Every drawing surface lives in one card; native ink and Excalidraw scenes stay independent. */
  mode?: DrawingMode
  diagram?: ExcalidrawData
  /** Specialist modes keep their own optional state without changing the shared ink schema. */
  skinStates?: Record<string, Record<string, unknown>>
}

/** Metadata for one embedded image; the actual bytes live in the local blob store, never inline. */
export interface ExcalidrawFileRef {
  id: string
  mimeType: string
  createdAt: number
}

/**
 * A free-form Excalidraw scene: shapes, freehand drawing, text, arrows,
 * frames, and embedded images. `appState` is a curated subset of drawing
 * preferences and camera position, not the full Excalidraw AppState (most of
 * which is transient UI state that shouldn't round-trip through storage).
 */
export interface ExcalidrawData {
  elements: readonly ExcalidrawElement[]
  appState: Record<string, unknown>
  files: readonly ExcalidrawFileRef[]
  updatedAt: string
}

export interface BudgetItem {
  id: string
  label: string
  amount: number
}

export interface BudgetData {
  currency: string
  items: BudgetItem[]
  /** The financial lens worn by this one shared set of line items. */
  skin?:
    | 'category_plan'
    | 'envelope'
    | 'zero_based'
    | '50_30_20'
    | 'cashflow'
    | 'sinking_funds'
    | 'shared_budget'
    | 'project_budget'
  /** Dates, ownership, goals, and other specialist details stay isolated by skin. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface ProgressData {
  label: string
  percent: number
}

export interface AiGeneratorData {
  prompt: string
  status: 'idle' | 'generating' | 'done'
}

interface TimelinePhase {
  id: string
  label: string
  start: number
  span: number
}

export interface TimelineData {
  totalUnits: number
  phases: TimelinePhase[]
}

export interface DialogLine {
  id: string
  character: string
  cue: string
}

export interface DialogData {
  lines: DialogLine[]
  skin?:
    | 'screenplay'
    | 'chat'
    | 'interview'
    | 'roleplay'
    | 'comic'
    | 'localization'
    | 'audio_transcript'
  skinStates?: Record<string, Record<string, unknown>>
}

export interface GameTunerData {
  grip: number
  drift: number
  stability: number
}

export interface AudioPlayerData {
  bpm: number
  key: string
  signalChain: string
  isPlaying: boolean
}

/** A card that IS a navigable sub-canvas ("canvas file"). */
export interface CanvasNodeData {
  /** Id of the canvas this node opens. */
  canvasId: string
  /** Presentation worn by this canvas card. Missing means the classic portal. */
  skin?: 'portal' | 'cover' | 'live_thumbnail' | 'dashboard_door' | 'folder_index'
  /** Optional settings owned by an individual presentation. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface KanbanCard {
  id: string
  label: string
}

interface KanbanColumn {
  id: string
  label: string
  cards: KanbanCard[]
}

export interface KanbanData {
  columns: KanbanColumn[]
}

export interface CountdownData {
  label: string
  /** ISO date (yyyy-mm-dd). */
  targetDate: string
}

export type HabitSkinMode =
  | 'week_grid'
  | 'month_heatmap'
  | 'chain'
  | 'scorecard'
  | 'routine_stack'
  | 'minimum_target'
  | 'flexible_frequency'

export interface HabitData {
  label: string
  /** Mon..Sun completion for the current week. */
  days: boolean[]
  streak: number
  /** Alternate presentation over the same canonical seven completions. */
  skin?: HabitSkinMode
  /** Specialist settings stay isolated from the shared week. */
  skinStates?: Record<string, Record<string, unknown>>
}

interface LinkItem {
  id: string
  label: string
  url: string
}

export interface LinksData {
  items: LinkItem[]
}

export interface LinkedListNode {
  /** Stable identity: pointers and selection never depend on the editable value. */
  id: string
  value: string
}

export interface LinkedListData {
  /** Canonical head-to-tail order. Every skin derives its pointers from this. */
  nodes: LinkedListNode[]
  /** The node exposed as `current` to circuits and focus-oriented skins. */
  selectedId?: string | null
  skin?:
    | 'chain'
    | 'vertical'
    | 'compact'
    | 'focus'
    | 'doubly_linked'
    | 'circular'
    | 'memory_map'
  /** Reserved for future per-skin preferences without contaminating node data. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface CodeData {
  language: string
  code: string
}

export interface QuoteData {
  text: string
  attribution: string
}

export interface PollOption {
  id: string
  label: string
  votes: number
}

export type PollSkinMode =
  | 'bars'
  | 'donut'
  | 'approval'
  | 'ranked_choice'
  | 'pairwise'
  | 'live_room'
  | 'anonymous'

export interface PollData {
  question: string
  /** Canonical tally. Every skin reads and writes these same counts. */
  options: PollOption[]
  skin?: PollSkinMode
  /** Ballots, duels, and room state stay with the skin that collects them. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface ContactData {
  name: string
  role: string
  email: string
  phone: string
}

export interface MediaData {
  /** Image URL or data URL. */
  url: string
  caption: string
  altText?: string
  /** Large pasted images live outside the synced board JSON. */
  localBlobKey?: string
  /** Which media presentation this card wears. Catalogued skins persist here. */
  skin?:
    | 'image'
    | 'video'
    | 'audio'
    | 'document_preview'
    | 'before_after'
    | 'gallery'
    | 'moodboard'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

export type MetricTrend = 'up' | 'down' | 'flat'

interface MetricTile {
  id: string
  label: string
  value: string
  unit: string
  trend: MetricTrend
}

export interface MetricsData {
  tiles: MetricTile[]
  /** Alternate KPI presentations over the same canonical tile collection. */
  skin?:
    | 'kpi_tiles'
    | 'big_number'
    | 'scoreboard'
    | 'traffic_lights'
    | 'delta'
    | 'target'
    | 'executive_strip'
  /** Specialist comparisons, goals, and ownership stay isolated per skin. */
  skinStates?: Record<string, Record<string, unknown>>
}

export type StickyNoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple'

export interface StickyNoteData {
  text: string
  color: StickyNoteColor
}

export interface CalendarData {
  /** Full year, e.g. 2026. */
  year: number
  /** 0-indexed month (0 = January). */
  month: number
  /** ISO dates (yyyy-mm-dd) marked with a dot. */
  markedDates: string[]
  /** Presentation worn by this calendar. Missing means the month grid. */
  skin?:
    | 'month'
    | 'week'
    | 'agenda'
    | 'year_heatmap'
    | 'availability'
    | 'shift_rota'
    | 'birthday_and_anniversary'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface TimerData {
  label: string
  /** Configured countdown length. */
  durationSeconds: number
  /** Seconds left, valid while the timer is paused/stopped. */
  remainingSeconds: number
  /** Epoch ms the timer completes at; null while paused/stopped. */
  endAt: number | null
}

export interface RatingData {
  label: string
  /** 0-5. */
  value: number
  /** The presentation worn by this one shared rating. */
  skin?:
    | 'stars'
    | 'slider'
    | 'emoji'
    | 'traffic_light'
    | 'nps'
    | 'rubric'
    | 'confidence'
  /** Rubric criteria and confidence evidence stay isolated by skin. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface ColorPaletteData {
  /** Hex strings, e.g. "#a3e635". */
  colors: string[]
}

export interface MoodTrackerData {
  /** Mon..Sun — index into the mood scale, or null if unset. */
  days: Array<number | null>
}

export interface CalculatorData {
  /** The readable record of how `result` was reached. */
  expression: string
  /** The one canonical output. Every skin writes it; the circuit reads it. */
  result: string
  /** Which calculator this card wears. Catalogued skins persist here. */
  skin?:
    | 'basic'
    | 'scientific'
    | 'tape'
    | 'finance'
    | 'programmer'
    | 'date_math'
    | 'named_variables'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

interface BarChartItem {
  id: string
  label: string
  value: number
  color?: string
}

export interface BarChartData {
  title: string
  bars: BarChartItem[]
  /** All chart modes render this same series instead of maintaining copies. */
  mode?:
    | 'bar'
    | 'line'
    | 'donut'
    | 'pie'
    | 'area'
    | 'sparkline'
    | 'gauge'
    | 'progress_ring'
    | 'heatmap'
    | 'scatter'
    | 'stacked'
  unit?: string
  /** Advanced visualization state stays isolated by skin. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface CounterData {
  label: string
  count: number
  step: number
  /** The presentation worn by this one stored number. */
  skin?:
    | 'tally'
    | 'clicker'
    | 'goal_counter'
    | 'up_down'
    | 'multi_counter'
    | 'timed_rate'
    | 'resetting_period'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface ProsConsItem {
  id: string
  text: string
}

export type ProsConsSkinMode =
  | 'balance'
  | 'debate'
  | 'red_team'
  | 'weighted_trade_off'
  | 'reversible_irreversible'

export interface ProsConsData {
  topic: string
  pros: ProsConsItem[]
  cons: ProsConsItem[]
  skin?: ProsConsSkinMode
  /** Optional specialist fields are isolated by skin and item id. */
  skinStates?: Record<string, Record<string, unknown>>
}

export interface PlannerTask {
  id: string
  text: string
  done: boolean
}

export interface WeeklyPlannerData {
  /** Mon..Sun task lists. */
  days: PlannerTask[][]
}

interface GoalMilestone {
  id: string
  label: string
  done: boolean
}

export interface GoalTrackerData {
  goal: string
  milestones: GoalMilestone[]
  mode?: 'simple' | 'milestones' | 'hours' | 'okr'
  simple?: ProgressData
  hours?: import('./widgetDataEducation').StudyGoalData
  okr?: import('./widgetDataExpansion').OkrData
}

export interface StopwatchData {
  /** Total ms accumulated before the current run. */
  elapsedMs: number
  /** Epoch ms when the current run started; null while paused. */
  startedAt: number | null
  /** Lap totals (elapsed ms at each lap press), newest last. */
  laps: number[]
}

export type ReadingStatus = 'queued' | 'reading' | 'done'

export interface ReadingItem {
  id: string
  title: string
  status: ReadingStatus
}

export interface ReadingListData {
  items: ReadingItem[]
}

interface Flashcard {
  id: string
  front: string
  back: string
}

export interface FlashcardsData {
  cards: Flashcard[]
  /** Index of the card currently shown. */
  current: number
  mode?: 'flashcards' | 'vocabulary' | 'quiz'
  vocabulary?: import('./widgetDataEducation').VocabData
  quiz?: import('./widgetDataEducation').QuizData
}

interface MeetingActionItem {
  id: string
  text: string
  done: boolean
}

export type MeetingNotesSkinMode =
  | 'agenda'
  | 'minutes'
  | 'stand_up'
  | 'retrospective'
  | 'one_to_one'
  | 'decision_review'
  | 'handoff'

export interface MeetingNotesData {
  /** ISO date (yyyy-mm-dd). */
  date: string
  attendees: string
  notes: string
  actions: MeetingActionItem[]
  skin?: MeetingNotesSkinMode
  /**
   * Optional specialist fields are isolated per skin: the panel prose a shape
   * asks for (a stand-up's blockers, a handoff's risks) and a per-item map
   * keyed by action id (a topic's timebox, a decision's review date).
   */
  skinStates?: Record<string, Record<string, unknown>>
}

/** Quadrants: 0 = urgent+important, 1 = important, 2 = urgent, 3 = neither. */
export interface MatrixItem {
  id: string
  text: string
  quadrant: 0 | 1 | 2 | 3
}

export interface PriorityMatrixData {
  items: MatrixItem[]
}

export interface DecisionData {
  question?: string
  options: string[]
  /** Index of the picked option; null before the first spin. */
  pickedIndex: number | null
  mode?: 'simple' | 'weighted'
  weights?: number[]
  history?: string[]
  lastRolledAt?: number | null
  noRepeatWindow?: number
}

export interface WorldClockData {
  /** IANA timezone names, e.g. "America/New_York". */
  zones: string[]
  /** The presentation worn by this one shared list of cities. */
  skin?:
    | 'city_grid'
    | 'analog_wall'
    | 'overlap_band'
    | 'meeting_planner'
    | 'travel_clock'
    | 'sunlight'
  /** Optional specialist state is isolated by skin so switching never loses it. */
  skinStates?: Record<string, Record<string, unknown>>
}

// ── Study & learning module schemas ────────────────────────────────────────
