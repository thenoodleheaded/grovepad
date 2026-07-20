// ---------------------------------------------------------------------------
// Per-module data schemas
// ---------------------------------------------------------------------------

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export interface NotesData {
  text: string
  mode?: 'plain' | 'sticky' | 'quote'
  color?: StickyNoteColor
  attribution?: string
}

interface BulletItem {
  id: string
  text: string
}

export interface BulletsData {
  items: BulletItem[]
}

interface ChecklistItem {
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
  /** Alternate views over the same task collection. Missing on legacy cards. */
  mode?: 'list' | 'board' | 'assignments' | 'day' | 'week' | 'timeline' | 'matrix'
}

/** Row-major cell matrix; the first row renders as the header. */
export interface TableData {
  rows: string[][]
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

export interface SketchpadData {
  height: number
  /** Optional for backwards compatibility with pre-drawing Sketchpad cards. */
  strokes?: readonly SketchpadStroke[]
  /** Quick ink and diagram scenes are saved independently in one Drawing card. */
  mode?: 'ink' | 'diagram'
  diagram?: ExcalidrawData
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

interface BudgetItem {
  id: string
  label: string
  amount: number
}

export interface BudgetData {
  currency: string
  items: BudgetItem[]
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

export interface HabitData {
  label: string
  /** Mon..Sun completion for the current week. */
  days: boolean[]
  streak: number
}

interface LinkItem {
  id: string
  label: string
  url: string
}

export interface LinksData {
  items: LinkItem[]
}

export interface CodeData {
  language: string
  code: string
}

export interface QuoteData {
  text: string
  attribution: string
}

interface PollOption {
  id: string
  label: string
  votes: number
}

export interface PollData {
  question: string
  options: PollOption[]
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
}

export interface DividerData {
  label: string
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
  expression: string
  result: string
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
  mode?: 'bar' | 'line' | 'donut' | 'pie'
  unit?: string
}

export interface CounterData {
  label: string
  count: number
  step: number
}

export interface ProsConsItem {
  id: string
  text: string
}

export interface ProsConsData {
  topic: string
  pros: ProsConsItem[]
  cons: ProsConsItem[]
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

export interface MeetingNotesData {
  /** ISO date (yyyy-mm-dd). */
  date: string
  attendees: string
  notes: string
  actions: MeetingActionItem[]
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
}

// ── Study & learning module schemas ────────────────────────────────────────
