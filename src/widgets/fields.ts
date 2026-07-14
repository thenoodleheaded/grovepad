import type {
  AiGeneratorData,
  AssignmentData,
  AudioPlayerData,
  BarChartData,
  BranchGateData,
  BudgetData,
  BulletsData,
  CalculatorData,
  CalendarData,
  ChecklistData,
  CitationData,
  CodeData,
  ColorPaletteData,
  ContactData,
  CornellData,
  CountdownData,
  CounterData,
  DailyAgendaData,
  DatePickerData,
  DecisionData,
  DecisionMatrixData,
  DialogData,
  DividerData,
  FlashcardsData,
  FormField,
  FormWidgetData,
  FormulaData,
  FormulaSheetData,
  GameTunerData,
  GoalTrackerData,
  GpaData,
  GradeCalcData,
  HabitData,
  InventoryData,
  KanbanData,
  LineChartData,
  LinksData,
  LogbookData,
  MediaData,
  MeetingNotesData,
  MetricsData,
  ModuleData,
  ModuleType,
  MoodTrackerData,
  NotesData,
  NumberInputData,
  OutlineData,
  PieChartData,
  PollData,
  PomodoroData,
  PriorityMatrixData,
  ProcessData,
  ProgressData,
  ProsConsData,
  QuizData,
  QuoteData,
  RatingData,
  ReadingListData,
  RiskRegisterData,
  StickyNoteData,
  StopwatchData,
  StudyGoalData,
  StatusData,
  SwotData,
  TableData,
  TextInputData,
  TimelineData,
  TimerData,
  TimesheetData,
  ToggleData,
  UnitConverterData,
  VocabData,
  WeeklyPlannerData,
  WorldClockData,
} from '../types/spatial'
import type { CommandDescriptor, FieldDescriptor, FieldValue } from './contracts/fields'
export type { CommandDescriptor, FieldDescriptor, FieldValue } from './contracts/fields'
import { EXPANSION_COMMANDS, EXPANSION_FIELDS } from './fields/expansion'
import { ATLAS_COMMANDS, ATLAS_FIELDS } from './fields/atlas'
import { AUTOMATION_CORE_COMMANDS, AUTOMATION_CORE_FIELDS } from './fields/automationCore'

// ---------------------------------------------------------------------------
// Bindable field registry — which values inside each module type can be
// wired up by the Unified Dependency Framework, and how to read/write them.
//
// A field with no `set` is source-only (an output port but no input port):
// derived values like a budget total or a checklist's done-count can feed
// other widgets but can't be overwritten themselves.
//
// Port geometry is deterministic: a field's index in this list IS its port
// slot on the card edge, so the wire layer and the port overlay agree on
// coordinates without any DOM measurement.
// ---------------------------------------------------------------------------

function num(v: FieldValue): number {
  if (Array.isArray(v)) return v.at(-1)?.v ?? 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  const parsed = parseFloat(v)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(v: FieldValue): string {
  if (Array.isArray(v)) return v.map((point) => point.v).join(', ')
  return typeof v === 'string' ? v : String(v)
}

function bool(v: FieldValue): boolean {
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v >= 1
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

function formulaValue(data: FormulaData): number {
  const a = Number.isFinite(data.a) ? data.a : 0
  const b = Number.isFinite(data.b) ? data.b : 0
  if (data.operator === 'add') return a + b
  if (data.operator === 'subtract') return a - b
  if (data.operator === 'multiply') return a * b
  if (data.operator === 'divide') return b === 0 ? 0 : a / b
  return b === 0 ? 0 : a % b
}

function primaryZoneTime(zones: string[]): string {
  const zone = zones[0]
  if (!zone) return '--:--'
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date())
  } catch {
    return '--:--'
  }
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function daysUntil(date: string): number {
  if (!date) return 0
  const target = new Date(`${date}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
  return Number.isFinite(days) ? days : 0
}

function formFieldFilled(field: FormField): boolean {
  if (field.type === 'checkbox') return field.value === true
  return String(field.value).trim().length > 0
}

function decisionWinner(data: DecisionMatrixData): { label: string; score: number } {
  let winner = { label: '', score: 0 }
  data.options.forEach((option) => {
    const score = data.criteria.reduce(
      (sum, criterion, index) =>
        sum +
        (Number.isFinite(criterion.weight) ? criterion.weight : 0) *
          (Number.isFinite(option.scores[index]) ? option.scores[index]! : 0),
      0,
    )
    if (!winner.label || score > winner.score) winner = { label: option.label, score }
  })
  return winner
}

const CONVERSION_FACTORS = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 0.000001, g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592, t: 1000 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
} as const

function convertedUnit(data: UnitConverterData): number {
  const value = Number.isFinite(data.value) ? data.value : 0
  if (data.category !== 'temperature') {
    const factors = CONVERSION_FACTORS[data.category] as Record<string, number>
    return (value * (factors[data.from] ?? 1)) / (factors[data.to] ?? 1)
  }
  let celsius = value
  if (data.from === 'F') celsius = (value - 32) * (5 / 9)
  else if (data.from === 'K') celsius = value - 273.15
  if (data.to === 'F') return celsius * (9 / 5) + 32
  if (data.to === 'K') return celsius + 273.15
  return celsius
}

const WIDGET_FIELDS: Partial<Record<ModuleType, FieldDescriptor[]>> = {
  notes: [
    {
      key: 'text',
      label: 'Text',
      valueType: 'text',
      get: (d) => (d as NotesData).text,
      set: (d, v) => ({ ...(d as NotesData), text: text(v) }),
    },
  ],
  sticky_note: [
    {
      key: 'text',
      label: 'Text',
      valueType: 'text',
      get: (d) => (d as StickyNoteData).text,
      set: (d, v) => ({ ...(d as StickyNoteData), text: text(v) }),
    },
  ],
  quote: [
    {
      key: 'text',
      label: 'Quote',
      valueType: 'text',
      get: (d) => (d as QuoteData).text,
      set: (d, v) => ({ ...(d as QuoteData), text: text(v) }),
    },
  ],
  counter: [
    {
      key: 'count',
      label: 'Count',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as CounterData).count,
      set: (d, v) => ({ ...(d as CounterData), count: num(v) }),
    },
  ],
  progress: [
    {
      key: 'percent',
      label: 'Percent',
      valueType: 'number',
      unit: 'percent',
      get: (d) => (d as ProgressData).percent,
      set: (d, v) => ({
        ...(d as ProgressData),
        percent: Math.min(100, Math.max(0, Math.round(num(v)))),
      }),
    },
  ],
  rating: [
    {
      key: 'value',
      label: 'Stars',
      valueType: 'number',
      get: (d) => (d as RatingData).value,
      set: (d, v) => ({ ...(d as RatingData), value: Math.min(5, Math.max(0, Math.round(num(v)))) }),
    },
  ],
  budget: [
    {
      key: 'total',
      label: 'Total',
      valueType: 'number',
      unit: 'currency',
      get: (d) => (d as BudgetData).items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0),
    },
  ],
  checklist: [
    {
      key: 'done_count',
      label: 'Done count',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ChecklistData).items.filter((i) => i.done).length,
    },
    {
      key: 'all_done',
      label: 'All done',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as ChecklistData).items
        return items.length > 0 && items.every((i) => i.done)
      },
    },
  ],
  goal_tracker: [
    {
      key: 'percent',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const ms = (d as GoalTrackerData).milestones
        return ms.length === 0 ? 0 : Math.round((ms.filter((m) => m.done).length / ms.length) * 100)
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => {
        const ms = (d as GoalTrackerData).milestones
        return ms.length > 0 && ms.every((m) => m.done)
      },
    },
  ],
  poll: [
    {
      key: 'votes',
      label: 'Total votes',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as PollData).options.reduce((s, o) => s + o.votes, 0),
    },
  ],
  habit: [
    {
      key: 'streak',
      label: 'Days done',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as HabitData).days.filter(Boolean).length,
    },
  ],
  countdown: [
    {
      key: 'days_left',
      label: 'Days left',
      valueType: 'number',
      unit: 'count',
      get: (d) =>
        Math.ceil(
          (new Date((d as CountdownData).targetDate).getTime() - Date.now()) / 86_400_000,
        ) || 0,
      timeSensitive: true,
    },
  ],
  stopwatch: [
    {
      key: 'running',
      label: 'Running',
      valueType: 'boolean',
      get: (d) => (d as StopwatchData).startedAt !== null,
    },
  ],
  timer: [
    {
      key: 'running',
      label: 'Running',
      valueType: 'boolean',
      get: (d) => (d as TimerData).endAt !== null,
    },
  ],
  bar_chart: [
    {
      key: 'total',
      label: 'Bar total',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as BarChartData).bars.reduce((s, b) => s + (Number.isFinite(b.value) ? b.value : 0), 0),
    },
  ],
  calculator: [
    {
      key: 'result',
      label: 'Result',
      valueType: 'number',
      get: (d) => num((d as CalculatorData).result),
    },
  ],
  weekly_planner: [
    {
      key: 'done_count',
      label: 'Done count',
      valueType: 'number',
      unit: 'count',
      get: (d) =>
        (d as WeeklyPlannerData).days.reduce((s, day) => s + day.filter((t) => t.done).length, 0),
    },
  ],
  meeting_notes: [
    {
      key: 'actions_done',
      label: 'Actions done',
      valueType: 'boolean',
      get: (d) => {
        const actions = (d as MeetingNotesData).actions
        return actions.length > 0 && actions.every((a) => a.done)
      },
    },
  ],
  pros_cons: [
    {
      key: 'pros_count',
      label: 'Pros',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ProsConsData).pros.filter((p) => p.text.trim()).length,
    },
    {
      key: 'cons_count',
      label: 'Cons',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ProsConsData).cons.filter((c) => c.text.trim()).length,
    },
  ],
  decision: [
    {
      key: 'picked',
      label: 'Picked option',
      valueType: 'text',
      get: (d) => {
        const dd = d as DecisionData
        return dd.pickedIndex !== null ? (dd.options[dd.pickedIndex] ?? '') : ''
      },
    },
  ],
  bullets: [
    {
      key: 'count',
      label: 'Items',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as BulletsData).items.filter((item) => item.text.trim()).length,
    },
  ],
  table: [
    {
      key: 'row_count',
      label: 'Rows',
      valueType: 'number',
      unit: 'count',
      get: (d) => Math.max(0, (d as TableData).rows.length - 1),
    },
  ],
  kanban: [
    {
      key: 'total_cards',
      label: 'Total cards',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as KanbanData).columns.reduce((s, c) => s + c.cards.length, 0),
    },
    {
      key: 'done_count',
      label: 'Last column',
      valueType: 'number',
      unit: 'count',
      get: (d) => {
        const cols = (d as KanbanData).columns
        return cols[cols.length - 1]?.cards.length ?? 0
      },
    },
  ],
  links: [
    {
      key: 'count',
      label: 'Links',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as LinksData).items.filter((i) => i.url.trim() || i.label.trim()).length,
    },
  ],
  code: [
    {
      key: 'code',
      label: 'Code',
      valueType: 'text',
      get: (d) => (d as CodeData).code,
      set: (d, v) => ({ ...(d as CodeData), code: text(v) }),
    },
  ],
  contact: [
    {
      key: 'name',
      label: 'Name',
      valueType: 'text',
      get: (d) => (d as ContactData).name,
      set: (d, v) => ({ ...(d as ContactData), name: text(v) }),
    },
    {
      key: 'email',
      label: 'Email',
      valueType: 'text',
      get: (d) => (d as ContactData).email,
      set: (d, v) => ({ ...(d as ContactData), email: text(v) }),
    },
  ],
  media: [
    {
      key: 'url',
      label: 'Image URL',
      valueType: 'text',
      get: (d) => (d as MediaData).url,
      set: (d, v) => ({ ...(d as MediaData), url: text(v) }),
    },
    {
      key: 'caption',
      label: 'Caption',
      valueType: 'text',
      get: (d) => (d as MediaData).caption,
      set: (d, v) => ({ ...(d as MediaData), caption: text(v) }),
    },
  ],
  metrics: [
    {
      key: 'value_1',
      label: 'Tile 1 value',
      valueType: 'number',
      get: (d) => {
        const first = (d as MetricsData).tiles[0]
        return first ? num(first.value) : 0
      },
      set: (d, v) => {
        const md = d as MetricsData
        const first = md.tiles[0]
        if (!first) return md
        return {
          tiles: md.tiles.map((t, i) => (i === 0 ? { ...t, value: String(num(v)) } : t)),
        }
      },
    },
  ],
  dialog: [
    {
      key: 'line_count',
      label: 'Lines',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as DialogData).lines.length,
    },
  ],
  divider: [
    {
      key: 'label',
      label: 'Label',
      valueType: 'text',
      get: (d) => (d as DividerData).label,
      set: (_d, v) => ({ label: text(v) }) satisfies DividerData,
    },
  ],
  calendar: [
    {
      key: 'marked_count',
      label: 'Marked days',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as CalendarData).markedDates.length,
    },
    {
      key: 'today',
      label: 'Today',
      valueType: 'text',
      unit: 'date_iso',
      get: () => new Date().toISOString().slice(0, 10),
      timeSensitive: true,
    },
  ],
  color_palette: [
    {
      key: 'count',
      label: 'Swatches',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ColorPaletteData).colors.length,
    },
  ],
  mood_tracker: [
    {
      key: 'logged_count',
      label: 'Days logged',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as MoodTrackerData).days.filter((day) => day !== null).length,
    },
  ],
  reading_list: [
    {
      key: 'done_count',
      label: 'Read',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ReadingListData).items.filter((i) => i.status === 'done').length,
    },
  ],
  flashcards: [
    {
      key: 'card_count',
      label: 'Cards',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as FlashcardsData).cards.length,
    },
  ],
  priority_matrix: [
    {
      key: 'do_first_count',
      label: 'Do-first items',
      valueType: 'number',
      get: (d) => (d as PriorityMatrixData).items.filter((i) => i.quadrant === 0).length,
    },
  ],
  timeline: [
    {
      key: 'total_units',
      label: 'Total units',
      valueType: 'number',
      get: (d) => (d as TimelineData).totalUnits,
      set: (d, v) => ({
        ...(d as TimelineData),
        totalUnits: Math.max(1, Math.round(num(v))),
      }),
    },
  ],
  ai_generator: [
    {
      key: 'prompt',
      label: 'Prompt',
      valueType: 'text',
      get: (d) => (d as AiGeneratorData).prompt,
      set: (d, v) => ({ ...(d as AiGeneratorData), prompt: text(v), status: 'idle' as const }),
    },
    {
      key: 'done',
      label: 'Generated',
      valueType: 'boolean',
      get: (d) => (d as AiGeneratorData).status === 'done',
    },
  ],
  game_tuner: [
    {
      key: 'grip',
      label: 'Grip',
      valueType: 'number',
      get: (d) => (d as GameTunerData).grip,
      set: (d, v) => ({
        ...(d as GameTunerData),
        grip: Math.min(100, Math.max(0, Math.round(num(v)))),
      }),
    },
    {
      key: 'drift',
      label: 'Drift',
      valueType: 'number',
      get: (d) => (d as GameTunerData).drift,
      set: (d, v) => ({
        ...(d as GameTunerData),
        drift: Math.min(90, Math.max(0, Math.round(num(v)))),
      }),
    },
    {
      key: 'stability',
      label: 'Stability',
      valueType: 'number',
      get: (d) => (d as GameTunerData).stability,
      set: (d, v) => ({
        ...(d as GameTunerData),
        stability: Math.min(100, Math.max(0, Math.round(num(v)))),
      }),
    },
  ],
  audio_player: [
    {
      key: 'bpm',
      label: 'BPM',
      valueType: 'number',
      get: (d) => (d as AudioPlayerData).bpm,
      set: (d, v) => ({
        ...(d as AudioPlayerData),
        bpm: Math.min(250, Math.max(40, Math.round(num(v)))),
      }),
    },
    {
      key: 'playing',
      label: 'Playing',
      valueType: 'boolean',
      get: (d) => (d as AudioPlayerData).isPlaying,
      set: (d, v) => ({
        ...(d as AudioPlayerData),
        isPlaying: typeof v === 'boolean' ? v : num(v) >= 1,
      }),
    },
  ],
  pomodoro: [
    {
      key: 'completed',
      label: 'Sessions done',
      valueType: 'number',
      get: (d) => (d as PomodoroData).completed,
    },
    {
      key: 'running',
      label: 'Running',
      valueType: 'boolean',
      get: (d) => (d as PomodoroData).endAt !== null,
    },
  ],
  vocab: [
    {
      key: 'known_count',
      label: 'Known',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as VocabData).terms.filter((t) => t.known).length,
    },
    {
      key: 'mastered',
      label: 'All known',
      valueType: 'boolean',
      get: (d) => {
        const terms = (d as VocabData).terms
        return terms.length > 0 && terms.every((t) => t.known)
      },
    },
  ],
  grade_calc: [
    {
      key: 'grade',
      label: 'Grade %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const cs = (d as GradeCalcData).components
        const w = cs.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)
        if (w <= 0) return 0
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.score) ? c.score : 0) * (Number.isFinite(c.weight) ? c.weight : 0),
          0,
        )
        return Math.round((sum / w) * 10) / 10
      },
    },
    {
      key: 'passing',
      label: 'Passing',
      valueType: 'boolean',
      get: (d) => {
        const cs = (d as GradeCalcData).components
        const w = cs.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0)
        if (w <= 0) return false
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.score) ? c.score : 0) * (Number.isFinite(c.weight) ? c.weight : 0),
          0,
        )
        return sum / w >= 60
      },
    },
  ],
  gpa: [
    {
      key: 'gpa',
      label: 'GPA',
      valueType: 'number',
      get: (d) => {
        const cs = (d as GpaData).courses
        const cr = cs.reduce((s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0), 0)
        if (cr <= 0) return 0
        const sum = cs.reduce(
          (s, c) => s + (Number.isFinite(c.credits) ? c.credits : 0) * (Number.isFinite(c.points) ? c.points : 0),
          0,
        )
        return Math.round((sum / cr) * 100) / 100
      },
    },
  ],
  assignment: [
    {
      key: 'done_count',
      label: 'Done',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as AssignmentData).items.filter((i) => i.status === 'done').length,
    },
    {
      key: 'all_done',
      label: 'All done',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as AssignmentData).items
        return items.length > 0 && items.every((i) => i.status === 'done')
      },
    },
  ],
  cornell: [
    {
      key: 'notes',
      label: 'Notes',
      valueType: 'text',
      get: (d) => (d as CornellData).notes,
      set: (d, v) => ({ ...(d as CornellData), notes: text(v) }),
    },
    {
      key: 'summary',
      label: 'Summary',
      valueType: 'text',
      get: (d) => (d as CornellData).summary,
      set: (d, v) => ({ ...(d as CornellData), summary: text(v) }),
    },
  ],
  formula_sheet: [
    {
      key: 'count',
      label: 'Formulas',
      valueType: 'number',
      get: (d) => (d as FormulaSheetData).formulas.filter((f) => f.name.trim() || f.expression.trim()).length,
    },
  ],
  citation: [
    {
      key: 'count',
      label: 'Sources',
      valueType: 'number',
      get: (d) => (d as CitationData).sources.filter((s) => s.title.trim()).length,
    },
  ],
  study_goal: [
    {
      key: 'percent',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const sd = d as StudyGoalData
        return sd.targetHours > 0
          ? Math.min(100, Math.round((sd.loggedHours / sd.targetHours) * 100))
          : 0
      },
    },
    {
      key: 'complete',
      label: 'Goal met',
      valueType: 'boolean',
      get: (d) => {
        const sd = d as StudyGoalData
        return sd.targetHours > 0 && sd.loggedHours >= sd.targetHours
      },
    },
  ],
  quiz: [
    {
      key: 'correct',
      label: 'Answered right',
      valueType: 'boolean',
      get: (d) => {
        const q = d as QuizData
        return q.picked !== null && (q.options.find((o) => o.id === q.picked)?.correct ?? false)
      },
    },
  ],
  text_input: [
    {
      key: 'value',
      label: 'Text value',
      valueType: 'text',
      get: (d) => (d as TextInputData).value,
      set: (d, v) => ({ ...(d as TextInputData), value: text(v) }),
    },
    {
      key: 'has_value',
      label: 'Has value',
      valueType: 'boolean',
      get: (d) => (d as TextInputData).value.trim().length > 0,
    },
  ],
  number_input: [
    {
      key: 'value',
      label: 'Number value',
      valueType: 'number',
      get: (d) => (d as NumberInputData).value,
      set: (d, v) => {
        const nd = d as NumberInputData
        const min = Math.min(nd.min, nd.max)
        const max = Math.max(nd.min, nd.max)
        return { ...nd, value: Math.min(max, Math.max(min, num(v))) }
      },
    },
  ],
  toggle: [
    {
      key: 'value',
      label: 'On / off',
      valueType: 'boolean',
      get: (d) => (d as ToggleData).value,
      set: (d, v) => ({ ...(d as ToggleData), value: bool(v) }),
    },
  ],
  branch_gate: [
    {
      key: 'value',
      label: 'True branch',
      valueType: 'boolean',
      get: (d) => (d as BranchGateData).value,
      set: (d, v) => ({ ...(d as BranchGateData), value: bool(v) }),
    },
    {
      key: 'inverse',
      label: 'False branch',
      valueType: 'boolean',
      get: (d) => !(d as BranchGateData).value,
    },
  ],
  formula: [
    {
      key: 'a',
      label: 'Input A',
      valueType: 'number',
      get: (d) => (d as FormulaData).a,
      set: (d, v) => ({ ...(d as FormulaData), a: num(v) }),
    },
    {
      key: 'b',
      label: 'Input B',
      valueType: 'number',
      get: (d) => (d as FormulaData).b,
      set: (d, v) => ({ ...(d as FormulaData), b: num(v) }),
    },
    {
      key: 'result',
      label: 'Result',
      valueType: 'number',
      get: (d) => formulaValue(d as FormulaData),
    },
  ],
  status: [
    {
      key: 'status',
      label: 'Status',
      valueType: 'text',
      get: (d) => (d as StatusData).value,
      set: (d, v) => {
        const value = text(v)
        const legal = ['not_started', 'in_progress', 'blocked', 'done'] as const
        return legal.includes(value as (typeof legal)[number])
          ? { ...(d as StatusData), value: value as StatusData['value'] }
          : d
      },
    },
    {
      key: 'progress',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const value = (d as StatusData).value
        return value === 'done' ? 100 : value === 'in_progress' || value === 'blocked' ? 50 : 0
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => (d as StatusData).value === 'done',
    },
  ],
  date_picker: [
    {
      key: 'date',
      label: 'Date',
      valueType: 'text',
      unit: 'date_iso',
      get: (d) => (d as DatePickerData).date,
      set: (d, v) => ({ ...(d as DatePickerData), date: text(v) }),
    },
    {
      key: 'days_until',
      label: 'Days until',
      valueType: 'number',
      unit: 'count',
      get: (d) => daysUntil((d as DatePickerData).date),
      timeSensitive: true,
    },
    {
      key: 'is_due',
      label: 'Is due',
      valueType: 'boolean',
      get: (d) => Boolean((d as DatePickerData).date) && daysUntil((d as DatePickerData).date) <= 0,
      timeSensitive: true,
    },
  ],
  outline: [
    {
      key: 'item_count',
      label: 'Items',
      valueType: 'number',
      get: (d) => (d as OutlineData).items.filter((item) => item.text.trim()).length,
    },
    {
      key: 'top_level_count',
      label: 'Top-level items',
      valueType: 'number',
      get: (d) => (d as OutlineData).items.filter((item) => item.depth === 0 && item.text.trim()).length,
    },
  ],
  form: [
    {
      key: 'filled_count',
      label: 'Filled fields',
      valueType: 'number',
      get: (d) => (d as FormWidgetData).fields.filter(formFieldFilled).length,
    },
    {
      key: 'complete',
      label: 'Required complete',
      valueType: 'boolean',
      get: (d) => {
        const fields = (d as FormWidgetData).fields
        return fields.length > 0 && fields.every((field) => !field.required || formFieldFilled(field))
      },
    },
    {
      key: 'first_value',
      label: 'First response',
      valueType: 'text',
      get: (d) => String((d as FormWidgetData).fields[0]?.value ?? ''),
      set: (d, v) => {
        const form = d as FormWidgetData
        const first = form.fields[0]
        if (!first) return form
        const value = first.type === 'checkbox' ? bool(v) : first.type === 'number' ? num(v) : text(v)
        return { ...form, fields: form.fields.map((field, index) => index === 0 ? { ...field, value } : field) }
      },
    },
  ],
  daily_agenda: [
    {
      key: 'done_count',
      label: 'Done',
      valueType: 'number',
      get: (d) => (d as DailyAgendaData).items.filter((item) => item.done).length,
    },
    {
      key: 'all_done',
      label: 'All done',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as DailyAgendaData).items
        return items.length > 0 && items.every((item) => item.done)
      },
    },
    {
      key: 'next_item',
      label: 'Next item',
      valueType: 'text',
      get: (d) =>
        [...(d as DailyAgendaData).items]
          .sort((a, b) => a.time.localeCompare(b.time))
          .find((item) => !item.done)?.title ?? '',
    },
  ],
  process: [
    {
      key: 'progress',
      label: 'Progress %',
      valueType: 'number',
      unit: 'percent',
      get: (d) => {
        const steps = (d as ProcessData).steps
        return steps.length ? Math.round((steps.filter((step) => step.status === 'done').length / steps.length) * 100) : 0
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => {
        const steps = (d as ProcessData).steps
        return steps.length > 0 && steps.every((step) => step.status === 'done')
      },
    },
    {
      key: 'current_step',
      label: 'Current step',
      valueType: 'text',
      get: (d) => (d as ProcessData).steps.find((step) => step.status === 'active')?.label ?? '',
    },
  ],
  risk_register: [
    {
      key: 'open_count',
      label: 'Open risks',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as RiskRegisterData).items.filter((item) => item.status === 'open').length,
    },
    {
      key: 'highest_score',
      label: 'Highest score',
      valueType: 'number',
      get: (d) =>
        (d as RiskRegisterData).items.reduce(
          (highest, item) => item.status === 'open' ? Math.max(highest, item.likelihood * item.impact) : highest,
          0,
        ),
    },
    {
      key: 'all_resolved',
      label: 'All resolved',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as RiskRegisterData).items
        return items.length > 0 && items.every((item) => item.status === 'resolved')
      },
    },
  ],
  decision_matrix: [
    {
      key: 'winner',
      label: 'Winner',
      valueType: 'text',
      get: (d) => decisionWinner(d as DecisionMatrixData).label,
    },
    {
      key: 'winner_score',
      label: 'Winner score',
      valueType: 'number',
      get: (d) => decisionWinner(d as DecisionMatrixData).score,
    },
  ],
  swot: [
    ...(
      [
        ['strength_count', 'Strengths', 'strengths'],
        ['weakness_count', 'Weaknesses', 'weaknesses'],
        ['opportunity_count', 'Opportunities', 'opportunities'],
        ['threat_count', 'Threats', 'threats'],
      ] as const
    ).map(([key, label, property]) => ({
      key,
      label,
      valueType: 'number' as const,
      unit: 'count' as const,
      get: (d: ModuleData) => (d as SwotData)[property].filter((item) => item.trim()).length,
    })),
  ],
  timesheet: [
    {
      key: 'total_hours',
      label: 'Total hours',
      valueType: 'number',
      get: (d) => (d as TimesheetData).entries.reduce((sum, entry) => sum + (Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0),
    },
    {
      key: 'billable_hours',
      label: 'Billable hours',
      valueType: 'number',
      get: (d) => (d as TimesheetData).entries.reduce((sum, entry) => sum + (entry.billable && Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0),
    },
    {
      key: 'amount',
      label: 'Billable amount',
      unit: 'currency',
      valueType: 'number',
      get: (d) => {
        const sheet = d as TimesheetData
        const hours = sheet.entries.reduce((sum, entry) => sum + (entry.billable && Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0), 0)
        return hours * (Number.isFinite(sheet.hourlyRate) ? Math.max(0, sheet.hourlyRate) : 0)
      },
    },
  ],
  inventory: [
    {
      key: 'total_units',
      label: 'Total units',
      valueType: 'number',
      get: (d) => (d as InventoryData).items.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0), 0),
    },
    {
      key: 'low_stock_count',
      label: 'Low stock',
      valueType: 'number',
      get: (d) => (d as InventoryData).items.filter((item) => item.quantity <= item.minimum).length,
    },
    {
      key: 'all_stocked',
      label: 'All stocked',
      valueType: 'boolean',
      get: (d) => {
        const items = (d as InventoryData).items
        return items.length > 0 && items.every((item) => item.quantity > item.minimum)
      },
    },
  ],
  logbook: [
    {
      key: 'entry_count',
      label: 'Entries',
      valueType: 'number',
      get: (d) => (d as LogbookData).entries.length,
    },
    {
      key: 'latest',
      label: 'Latest entry',
      valueType: 'text',
      get: (d) => [...(d as LogbookData).entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.text ?? '',
    },
  ],
  line_chart: [
    {
      key: 'series',
      label: 'Series',
      valueType: 'series',
      get: (d) => (d as LineChartData).points.map((point, index) => ({ t: index, v: point.value })),
      set: (d, v) => {
        if (!Array.isArray(v)) return d
        return {
          ...(d as LineChartData),
          points: v.slice(-400).map((point) => ({
            id: crypto.randomUUID(),
            label: new Date(point.t).toLocaleDateString(),
            value: point.v,
          })),
        }
      },
    },
    {
      key: 'latest',
      label: 'Latest value',
      valueType: 'number',
      get: (d) => (d as LineChartData).points[(d as LineChartData).points.length - 1]?.value ?? 0,
    },
    {
      key: 'average',
      label: 'Average',
      valueType: 'number',
      get: (d) => {
        const points = (d as LineChartData).points
        return points.length ? points.reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0) / points.length : 0
      },
    },
    {
      key: 'max',
      label: 'Maximum',
      valueType: 'number',
      get: (d) => {
        const values = (d as LineChartData).points.map((point) => Number.isFinite(point.value) ? point.value : 0)
        return values.length ? Math.max(...values) : 0
      },
    },
  ],
  pie_chart: [
    {
      key: 'total',
      label: 'Total',
      valueType: 'number',
      get: (d) => (d as PieChartData).segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0),
    },
    {
      key: 'largest_share',
      label: 'Largest share %',
      valueType: 'number',
      get: (d) => {
        const segments = (d as PieChartData).segments
        const total = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0)
        const largest = segments.reduce((max, segment) => Math.max(max, Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0), 0)
        return total > 0 ? (largest / total) * 100 : 0
      },
    },
    {
      key: 'largest_label',
      label: 'Largest segment',
      valueType: 'text',
      get: (d) => {
        const segments = (d as PieChartData).segments
        return segments.reduce<PieChartData['segments'][number] | null>((best, segment) => !best || segment.value > best.value ? segment : best, null)?.label ?? ''
      },
    },
  ],
  unit_converter: [
    {
      key: 'input',
      label: 'Input',
      valueType: 'number',
      get: (d) => (d as UnitConverterData).value,
      set: (d, v) => ({ ...(d as UnitConverterData), value: num(v) }),
    },
    {
      key: 'output',
      label: 'Converted output',
      valueType: 'number',
      get: (d) => convertedUnit(d as UnitConverterData),
    },
  ],
  world_clock: [
    {
      key: 'primary_time',
      label: 'Primary time',
      valueType: 'text',
      get: (d) => primaryZoneTime((d as WorldClockData).zones),
      timeSensitive: true,
    },
    {
      key: 'zone_count',
      label: 'Zones',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as WorldClockData).zones.length,
    },
  ],
  ...EXPANSION_FIELDS,
  ...ATLAS_FIELDS,
  ...AUTOMATION_CORE_FIELDS,
}

// ---------------------------------------------------------------------------
// Trigger commands — one-shot mutations a trigger connection can fire.
// ---------------------------------------------------------------------------

const WIDGET_COMMANDS: Partial<Record<ModuleType, CommandDescriptor[]>> = {
  stopwatch: [
    {
      key: 'reset',
      label: 'Reset stopwatch',
      run: () => ({ elapsedMs: 0, startedAt: null, laps: [] }),
    },
  ],
  timer: [
    {
      key: 'reset',
      label: 'Reset timer',
      run: (d) => {
        const t = d as TimerData
        return { ...t, remainingSeconds: t.durationSeconds, endAt: null }
      },
    },
  ],
  counter: [
    {
      key: 'increment',
      label: 'Increment counter',
      run: (d) => {
        const c = d as CounterData
        return { ...c, count: c.count + (Number.isFinite(c.step) && c.step !== 0 ? c.step : 1) }
      },
    },
    {
      key: 'decrement',
      label: 'Decrement counter',
      run: (d) => {
        const c = d as CounterData
        return { ...c, count: c.count - (Number.isFinite(c.step) && c.step !== 0 ? c.step : 1) }
      },
    },
    { key: 'reset', label: 'Reset counter', run: (d) => ({ ...(d as CounterData), count: 0 }) },
  ],
  checklist: [
    {
      key: 'uncheck_all',
      label: 'Uncheck all tasks',
      run: (d) => ({
        items: (d as ChecklistData).items.map((i) => ({ ...i, done: false })),
      }),
    },
    {
      key: 'check_all',
      label: 'Check all tasks',
      run: (d) => ({
        items: (d as ChecklistData).items.map((i) => ({ ...i, done: true })),
      }),
    },
    {
      key: 'add_item',
      label: 'Add task from wire',
      acceptsPayload: true,
      run: (d, payload) => ({
        items: [
          ...(d as ChecklistData).items,
          { id: crypto.randomUUID(), label: text(payload ?? '').trim() || 'New task', done: false },
        ],
      }),
    },
  ],
  bullets: [
    {
      key: 'add_item',
      label: 'Add bullet from wire',
      acceptsPayload: true,
      run: (d, payload) => ({
        items: [
          ...(d as BulletsData).items,
          { id: crypto.randomUUID(), text: text(payload ?? '').trim() || 'New item' },
        ],
      }),
    },
  ],
  links: [
    {
      key: 'add_item',
      label: 'Add link from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const value = text(payload ?? '').trim()
        const looksLikeUrl = /^https?:\/\//i.test(value)
        return {
          items: [
            ...(d as LinksData).items,
            { id: crypto.randomUUID(), label: looksLikeUrl ? '' : value, url: looksLikeUrl ? value : '' },
          ],
        }
      },
    },
  ],
  kanban: [
    {
      key: 'add_item',
      label: 'Add card from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const kd = d as KanbanData
        if (kd.columns.length === 0) return kd
        const card = { id: crypto.randomUUID(), label: text(payload ?? '').trim() || 'New card' }
        return {
          columns: kd.columns.map((column, index) =>
            index === 0 ? { ...column, cards: [...column.cards, card] } : column,
          ),
        }
      },
    },
  ],
  decision: [
    {
      key: 'add_item',
      label: 'Add option from wire',
      acceptsPayload: true,
      run: (d, payload) => ({
        ...(d as DecisionData),
        options: [...(d as DecisionData).options, text(payload ?? '').trim() || 'New option'],
      }),
    },
  ],
  world_clock: [
    {
      key: 'add_zone',
      label: 'Add timezone from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const zone = text(payload ?? '').trim()
        const wd = d as WorldClockData
        if (!zone || wd.zones.includes(zone) || !isValidTimeZone(zone)) return wd
        return { zones: [...wd.zones, zone] }
      },
    },
  ],
  progress: [
    {
      key: 'reset',
      label: 'Reset to 0%',
      run: (d) => ({ ...(d as ProgressData), percent: 0 }),
    },
  ],
  rating: [
    {
      key: 'reset',
      label: 'Clear rating',
      run: (d) => ({ ...(d as RatingData), value: 0 }),
    },
  ],
  habit: [
    {
      key: 'reset',
      label: 'Clear the week',
      run: (d) => ({ ...(d as HabitData), days: Array(7).fill(false), streak: 0 }),
    },
  ],
  poll: [
    {
      key: 'reset',
      label: 'Clear votes',
      run: (d) => ({
        ...(d as PollData),
        options: (d as PollData).options.map((o) => ({ ...o, votes: 0 })),
      }),
    },
  ],
  mood_tracker: [
    {
      key: 'reset',
      label: 'Clear the week',
      run: () => ({ days: Array(7).fill(null) }),
    },
  ],
  flashcards: [
    {
      key: 'increment',
      label: 'Next card',
      run: (d) => {
        const fd = d as FlashcardsData
        if (fd.cards.length === 0) return fd
        return { ...fd, current: (fd.current + 1) % fd.cards.length }
      },
    },
    {
      key: 'decrement',
      label: 'Previous card',
      run: (d) => {
        const fd = d as FlashcardsData
        if (fd.cards.length === 0) return fd
        return { ...fd, current: (fd.current - 1 + fd.cards.length) % fd.cards.length }
      },
    },
  ],
  weekly_planner: [
    {
      key: 'uncheck_all',
      label: 'Uncheck all tasks',
      run: (d) => ({
        days: (d as WeeklyPlannerData).days.map((day) => day.map((t) => ({ ...t, done: false }))),
      }),
    },
    {
      key: 'check_all',
      label: 'Check all tasks',
      run: (d) => ({
        days: (d as WeeklyPlannerData).days.map((day) => day.map((t) => ({ ...t, done: true }))),
      }),
    },
  ],
  meeting_notes: [
    {
      key: 'uncheck_all',
      label: 'Reopen all actions',
      run: (d) => ({
        ...(d as MeetingNotesData),
        actions: (d as MeetingNotesData).actions.map((a) => ({ ...a, done: false })),
      }),
    },
  ],
  goal_tracker: [
    {
      key: 'uncheck_all',
      label: 'Reset milestones',
      run: (d) => ({
        ...(d as GoalTrackerData),
        milestones: (d as GoalTrackerData).milestones.map((m) => ({ ...m, done: false })),
      }),
    },
    {
      key: 'check_all',
      label: 'Complete all milestones',
      run: (d) => ({
        ...(d as GoalTrackerData),
        milestones: (d as GoalTrackerData).milestones.map((m) => ({ ...m, done: true })),
      }),
    },
  ],
  reading_list: [
    {
      key: 'reset',
      label: 'Re-queue everything',
      run: (d) => ({
        items: (d as ReadingListData).items.map((i) => ({ ...i, status: 'queued' as const })),
      }),
    },
  ],
  pomodoro: [
    {
      key: 'reset',
      label: 'Reset timer & sessions',
      run: (d) => {
        const p = d as PomodoroData
        return {
          ...p,
          phase: 'work' as const,
          endAt: null,
          remainingSeconds: p.workMinutes * 60,
          completed: 0,
        }
      },
    },
  ],
  vocab: [
    {
      key: 'reset',
      label: 'Mark all unknown',
      run: (d) => ({
        terms: (d as VocabData).terms.map((t) => ({ ...t, known: false })),
      }),
    },
  ],
  assignment: [
    {
      key: 'check_all',
      label: 'Mark all done',
      run: (d) => ({
        items: (d as AssignmentData).items.map((i) => ({ ...i, status: 'done' as const })),
      }),
    },
    {
      key: 'reset',
      label: 'Reset all to to-do',
      run: (d) => ({
        items: (d as AssignmentData).items.map((i) => ({ ...i, status: 'todo' as const })),
      }),
    },
  ],
  study_goal: [
    {
      key: 'reset',
      label: 'Reset logged hours',
      run: (d) => ({ ...(d as StudyGoalData), loggedHours: 0 }),
    },
  ],
  quiz: [
    {
      key: 'reset',
      label: 'Clear answer',
      run: (d) => ({ ...(d as QuizData), picked: null }),
    },
  ],
  number_input: [
    {
      key: 'increment',
      label: 'Increase by step',
      run: (d) => {
        const value = d as NumberInputData
        return { ...value, value: Math.min(value.max, value.value + Math.max(0.0001, Math.abs(value.step))) }
      },
    },
    {
      key: 'decrement',
      label: 'Decrease by step',
      run: (d) => {
        const value = d as NumberInputData
        return { ...value, value: Math.max(value.min, value.value - Math.max(0.0001, Math.abs(value.step))) }
      },
    },
    { key: 'reset', label: 'Reset to minimum', run: (d) => ({ ...(d as NumberInputData), value: (d as NumberInputData).min }) },
  ],
  toggle: [
    { key: 'reset', label: 'Switch off', run: (d) => ({ ...(d as ToggleData), value: false }) },
  ],
  branch_gate: [
    { key: 'reset', label: 'Choose false branch', run: (d) => ({ ...(d as BranchGateData), value: false }) },
  ],
  status: [
    { key: 'reset', label: 'Reset status', run: (d) => ({ ...(d as StatusData), value: 'not_started' as const }) },
    { key: 'check_all', label: 'Mark done', run: (d) => ({ ...(d as StatusData), value: 'done' as const }) },
  ],
  form: [
    {
      key: 'reset',
      label: 'Clear responses',
      run: (d) => ({
        ...(d as FormWidgetData),
        fields: (d as FormWidgetData).fields.map((field) => ({
          ...field,
          value: field.type === 'checkbox' ? false : field.type === 'number' ? 0 : '',
        })),
      }),
    },
  ],
  daily_agenda: [
    {
      key: 'uncheck_all',
      label: 'Reopen all agenda items',
      run: (d) => ({ ...(d as DailyAgendaData), items: (d as DailyAgendaData).items.map((item) => ({ ...item, done: false })) }),
    },
    {
      key: 'check_all',
      label: 'Complete all agenda items',
      run: (d) => ({ ...(d as DailyAgendaData), items: (d as DailyAgendaData).items.map((item) => ({ ...item, done: true })) }),
    },
  ],
  process: [
    {
      key: 'reset',
      label: 'Restart process',
      run: (d) => ({ steps: (d as ProcessData).steps.map((step, index) => ({ ...step, status: index === 0 ? 'active' as const : 'todo' as const })) }),
    },
    {
      key: 'check_all',
      label: 'Complete process',
      run: (d) => ({ steps: (d as ProcessData).steps.map((step) => ({ ...step, status: 'done' as const })) }),
    },
  ],
  risk_register: [
    {
      key: 'reset',
      label: 'Reopen all risks',
      run: (d) => ({ items: (d as RiskRegisterData).items.map((item) => ({ ...item, status: 'open' as const })) }),
    },
  ],
  ...EXPANSION_COMMANDS,
  ...ATLAS_COMMANDS,
  ...AUTOMATION_CORE_COMMANDS,
}

export function fieldsFor(type: ModuleType): FieldDescriptor[] {
  return WIDGET_FIELDS[type] ?? []
}

export function fieldDescriptor(type: ModuleType, key: string): FieldDescriptor | undefined {
  return WIDGET_FIELDS[type]?.find((f) => f.key === key)
}

export function commandsFor(type: ModuleType): CommandDescriptor[] {
  return WIDGET_COMMANDS[type] ?? []
}
