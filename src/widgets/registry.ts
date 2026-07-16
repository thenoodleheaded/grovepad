import {
  ArrowLeftRight,
  AudioLines,
  BarChart3,
  BookMarked,
  BookOpen,
  BrainCircuit,
  Calculator,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartLine,
  ChartNoAxesColumn,
  ChartPie,
  CircleDollarSign,
  ClipboardList,
  Code2,
  Columns3,
  Contact,
  Dices,
  FileText,
  Flame,
  FolderOpen,
  FunctionSquare,
  GalleryHorizontalEnd,
  Gamepad2,
  Gauge,
  Binary,
  Globe,
  Goal,
  GraduationCap,
  Grid2x2,
  Hash,
  Hourglass,
  Image,
  Languages,
  Layers,
  Link2,
  List,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Package,
  Palette,
  PenTool,
  Quote,
  Scale,
  SeparatorHorizontal,
  ShieldAlert,
  Smile,
  Sparkles,
  Star,
  StickyNote,
  Table2,
  Target,
  TextCursorInput,
  Timer,
  TimerReset,
  ToggleRight,
  Vote,
  Workflow,
} from 'lucide-react'
import type { ModuleType } from '../types/spatial'
import { GRID_SIZE, MODULE_PACK_REQUIREMENTS } from '../types/spatial'
import type { WidgetCategory, WidgetDefinition, WidgetSizing } from './contracts/registry'
export type { WidgetCategory, WidgetDefinition, WidgetSizing } from './contracts/registry'
import { EXPANSION_WIDGET_DEFINITIONS } from './registry/expansion'
import { ATLAS_WIDGET_DEFINITIONS } from './registry/atlas'
import { AUTOMATION_CORE_DEFINITIONS } from './registry/automationCore'
import { REVIEWED_WIDGET_SIZING } from './sizingProfiles'

// ---------------------------------------------------------------------------
// Widget registry — the single database describing every widget type.
//
// Everything the app needs to know about a widget type lives in one entry:
// picker metadata (label, description, icon, category, accent), spawn
// defaults (size, starter data), and pack gating. Stores and UI read from
// here so adding a widget type is one entry + one renderer case.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  structure: 'Structure',
  notes: 'Notes & Content',
  planning: 'Tasks & Planning',
  study: 'Study & Learning',
  data: 'Data & Views',
  media: 'Media & Creative',
  tracking: 'Tracking',
  automation: 'Automation & Logic',
  life: 'Life Systems',
  specialist: 'Specialist',
}

export const CATEGORY_ORDER: readonly WidgetCategory[] = [
  'structure',
  'notes',
  'planning',
  'study',
  'data',
  'media',
  'tracking',
  'automation',
  'life',
  'specialist',
]

/**
 * Per-type resize rules. Absent bounds fall back to DEFAULT_SIZING. A widget
 * whose height always follows its content sets `autoHeight` — the resize
 * handle then adjusts width only and the card's height reporter owns height.
 */
export const DEFAULT_SIZING = {
  minWidth: GRID_SIZE * 5, // 200px — a floor that keeps control rows unclipped
  minHeight: GRID_SIZE * 3, // 120px
  // A card is never a screen-swallowing void. Content-fit widgets (autoHeight)
  // opt out of the height ceiling so long content still grows freely.
  maxWidth: GRID_SIZE * 32, // 1280px
  maxHeight: GRID_SIZE * 32, // 1280px
  autoHeight: false,
} satisfies WidgetSizing

const C = GRID_SIZE

function uid(): string {
  return crypto.randomUUID()
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export const WIDGET_REGISTRY: Record<ModuleType, WidgetDefinition> = {
  canvas_node: {
    type: 'canvas_node',
    label: 'Canvas',
    description: 'A whole board inside a card — click its name to enter it',
    icon: FolderOpen,
    category: 'structure',
    accent: '#a3e635',
    defaultSize: { width: 280, height: C * 2 },
    sizing: { minWidth: C * 4, minHeight: C * 2, maxHeight: C * 2 },
    // canvasId is assigned by the store when the backing canvas is created.
    defaultData: () => ({ canvasId: '' }),
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    description: 'A labeled section break for organizing the canvas',
    icon: SeparatorHorizontal,
    category: 'structure',
    accent: '#94a3b8',
    defaultSize: { width: 320, height: C * 2 },
    defaultData: () => ({ label: 'Section' }),
  },
  notes: {
    type: 'notes',
    label: 'Notes',
    description: 'Free-form text that grows as you type',
    icon: FileText,
    category: 'notes',
    accent: '#e2e8f0',
    defaultSize: { width: 320, height: C * 5 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ text: '' }),
  },
  bullets: {
    type: 'bullets',
    label: 'Bullets',
    description: 'Quick unordered list of short points',
    icon: List,
    category: 'notes',
    accent: '#93c5fd',
    defaultSize: { width: 280, height: C * 4 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ items: [{ id: crypto.randomUUID(), text: 'First point' }] }),
  },
  quote: {
    type: 'quote',
    label: 'Quote',
    description: 'A pull-quote or callout with attribution',
    icon: Quote,
    category: 'notes',
    accent: '#fbcfe8',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({ text: 'The canvas stretches on, in every direction.', attribution: '' }),
  },
  code: {
    type: 'code',
    label: 'Code Snippet',
    description: 'Monospace code block with a language tag',
    icon: Code2,
    category: 'notes',
    accent: '#7dd3fc',
    defaultSize: { width: 360, height: C * 5 },
    defaultData: () => ({ language: 'ts', code: '' }),
  },
  sticky_note: {
    type: 'sticky_note',
    label: 'Sticky Note',
    description: 'A quick colored note — pick a hue, jot it down',
    icon: StickyNote,
    category: 'notes',
    accent: '#fde047',
    defaultSize: { width: 260, height: C * 4 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ text: '', color: 'yellow' }),
  },
  checklist: {
    type: 'checklist',
    label: 'Checklist',
    description: 'Tasks with done states — Enter adds the next',
    icon: ListChecks,
    category: 'planning',
    accent: '#86efac',
    defaultSize: { width: 280, height: C * 4 },
    sizing: { minWidth: C * 4, autoHeight: true },
    defaultData: () => ({ items: [{ id: uid(), label: 'New task', done: false }] }),
  },
  kanban: {
    type: 'kanban',
    label: 'Kanban',
    description: 'Lightweight three-column board',
    icon: Columns3,
    category: 'planning',
    accent: '#c4b5fd',
    defaultSize: { width: 440, height: C * 6 },
    defaultData: () => ({
      columns: [
        { id: uid(), label: 'To do', cards: [{ id: uid(), label: 'First card' }] },
        { id: uid(), label: 'Doing', cards: [] },
        { id: uid(), label: 'Done', cards: [] },
      ],
    }),
  },
  timeline: {
    type: 'timeline',
    label: 'Timeline',
    description: 'Phases laid out across a time span',
    icon: GalleryHorizontalEnd,
    category: 'planning',
    accent: '#fca5a5',
    defaultSize: { width: 400, height: C * 3 },
    defaultData: () => ({
      totalUnits: 12,
      phases: [
        { id: uid(), label: 'Research', start: 0, span: 4 },
        { id: uid(), label: 'Build', start: 3, span: 6 },
        { id: uid(), label: 'Polish', start: 8, span: 4 },
      ],
    }),
  },
  pros_cons: {
    type: 'pros_cons',
    label: 'Pros & Cons',
    description: 'Two-column argument sheet for weighing a decision',
    icon: Scale,
    category: 'planning',
    accent: '#fbbf24',
    defaultSize: { width: 340, height: C * 4 },
    defaultData: () => ({
      topic: '',
      pros: [{ id: uid(), text: '' }],
      cons: [{ id: uid(), text: '' }],
    }),
  },
  weekly_planner: {
    type: 'weekly_planner',
    label: 'Week Planner',
    description: 'Seven days, a light task slot for each',
    icon: CalendarRange,
    category: 'planning',
    accent: '#93c5fd',
    defaultSize: { width: 320, height: C * 7 },
    defaultData: () => ({ days: [[], [], [], [], [], [], []] }),
  },
  priority_matrix: {
    type: 'priority_matrix',
    label: 'Priority Matrix',
    description: 'Eisenhower 2×2 — do, schedule, delegate, drop',
    icon: Grid2x2,
    category: 'planning',
    accent: '#fca5a5',
    defaultSize: { width: 380, height: C * 6 },
    defaultData: () => ({ items: [] }),
  },
  decision: {
    type: 'decision',
    label: 'Decision Picker',
    description: "List options and let the dice pick — when you truly can't",
    icon: Dices,
    category: 'planning',
    accent: '#f0abfc',
    defaultSize: { width: 300, height: C * 5 },
    defaultData: () => ({ question: '', options: ['', ''], pickedIndex: null }),
  },
  meeting_notes: {
    type: 'meeting_notes',
    label: 'Meeting Notes',
    description: 'Date, attendees, notes, and action items',
    icon: ClipboardList,
    category: 'notes',
    accent: '#a5b4fc',
    defaultSize: { width: 340, height: C * 6 },
    defaultData: () => ({
      date: new Date().toISOString().slice(0, 10),
      attendees: '',
      notes: '',
      actions: [],
    }),
  },
  flashcards: {
    type: 'flashcards',
    label: 'Flashcards',
    description: 'A study deck — click the card to flip it',
    icon: Layers,
    category: 'notes',
    accent: '#c4b5fd',
    defaultSize: { width: 300, height: C * 5 },
    defaultData: () => ({
      cards: [{ id: uid(), front: '', back: '' }],
      current: 0,
    }),
  },
  goal_tracker: {
    type: 'goal_tracker',
    label: 'Goal Tracker',
    description: 'One goal, its milestones, and live progress',
    icon: Goal,
    category: 'tracking',
    accent: '#86efac',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      goal: '',
      milestones: [{ id: uid(), label: '', done: false }],
    }),
  },
  stopwatch: {
    type: 'stopwatch',
    label: 'Stopwatch',
    description: 'Elapsed time with laps',
    icon: Hourglass,
    category: 'tracking',
    accent: '#fde047',
    defaultSize: { width: 240, height: C * 4 },
    defaultData: () => ({ elapsedMs: 0, startedAt: null, laps: [] }),
  },
  reading_list: {
    type: 'reading_list',
    label: 'Reading List',
    description: 'Books & articles with queued/reading/done states',
    icon: BookOpen,
    category: 'tracking',
    accent: '#fdba74',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({
      title: 'Chart',
      items: [{ id: uid(), title: '', status: 'queued' }],
    }),
  },
  world_clock: {
    type: 'world_clock',
    label: 'World Clock',
    description: 'Local time in the cities you care about',
    icon: Globe,
    category: 'data',
    accent: '#67e8f9',
    defaultSize: { width: 280, height: C * 4 },
    defaultData: () => ({ zones: ['America/New_York', 'Europe/London', 'Asia/Tokyo'] }),
  },
  pomodoro: {
    type: 'pomodoro',
    label: 'Pomodoro Timer',
    description: 'Work/break focus cycles with a session counter',
    icon: TimerReset,
    category: 'study',
    accent: '#fb7185',
    defaultSize: { width: 260, height: C * 5 },
    defaultData: () => ({
      label: 'Focus',
      workMinutes: 25,
      breakMinutes: 5,
      phase: 'work',
      endAt: null,
      remainingSeconds: 25 * 60,
      completed: 0,
    }),
  },
  vocab: {
    type: 'vocab',
    label: 'Vocabulary',
    description: 'Term & definition list with known toggles',
    icon: Languages,
    category: 'study',
    accent: '#c4b5fd',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      terms: [{ id: uid(), term: '', definition: '', known: false }],
    }),
  },
  grade_calc: {
    type: 'grade_calc',
    label: 'Grade Calculator',
    description: 'Weighted components → your live course grade',
    icon: Calculator,
    category: 'study',
    accent: '#5eead4',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      components: [
        { id: uid(), name: 'Exams', score: 0, weight: 50 },
        { id: uid(), name: 'Homework', score: 0, weight: 50 },
      ],
    }),
  },
  gpa: {
    type: 'gpa',
    label: 'GPA Tracker',
    description: 'Courses & credits → your computed GPA',
    icon: GraduationCap,
    category: 'study',
    accent: '#93c5fd',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      courses: [{ id: uid(), name: '', credits: 3, points: 4 }],
    }),
  },
  assignment: {
    type: 'assignment',
    label: 'Assignments',
    description: 'Homework tracker with due dates and status',
    icon: ClipboardList,
    category: 'study',
    accent: '#fca5a5',
    defaultSize: { width: 340, height: C * 5 },
    defaultData: () => ({
      items: [{ id: uid(), title: '', due: '', status: 'todo' }],
    }),
  },
  cornell: {
    type: 'cornell',
    label: 'Cornell Notes',
    description: 'Cue column, notes, and a summary band',
    icon: NotebookPen,
    category: 'study',
    accent: '#fcd34d',
    defaultSize: { width: 360, height: C * 6 },
    defaultData: () => ({ cues: '', notes: '', summary: '' }),
  },
  formula_sheet: {
    type: 'formula_sheet',
    label: 'Formula Sheet',
    description: 'A quick-reference list of named formulas',
    icon: FunctionSquare,
    category: 'study',
    accent: '#a5b4fc',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      formulas: [{ id: uid(), name: '', expression: '' }],
    }),
  },
  citation: {
    type: 'citation',
    label: 'Citations',
    description: 'Source manager with an APA/MLA/Chicago toggle',
    icon: BookMarked,
    category: 'study',
    accent: '#d8b4fe',
    defaultSize: { width: 340, height: C * 5 },
    defaultData: () => ({
      style: 'APA',
      sources: [{ id: uid(), title: '', author: '', year: '' }],
    }),
  },
  study_goal: {
    type: 'study_goal',
    label: 'Study Goal',
    description: 'Logged vs target study hours with live progress',
    icon: Target,
    category: 'study',
    accent: '#86efac',
    defaultSize: { width: 300, height: C * 4 },
    defaultData: () => ({ subject: '', targetHours: 10, loggedHours: 0 }),
  },
  quiz: {
    type: 'quiz',
    label: 'Quiz',
    description: 'A self-check question — pick, then reveal the answer',
    icon: BrainCircuit,
    category: 'study',
    accent: '#f9a8d4',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      prompt: '',
      options: [
        { id: uid(), text: '', correct: true },
        { id: uid(), text: '', correct: false },
      ],
      picked: null,
    }),
  },
  calendar: {
    type: 'calendar',
    label: 'Calendar',
    description: 'A month view — click days to mark them',
    icon: CalendarDays,
    category: 'planning',
    accent: '#7dd3fc',
    defaultSize: { width: 280, height: C * 6 },
    defaultData: () => {
      const now = new Date()
      return { year: now.getFullYear(), month: now.getMonth(), markedDates: [] }
    },
  },
  countdown: {
    type: 'countdown',
    label: 'Countdown',
    description: 'Days remaining until a target date',
    icon: CalendarClock,
    category: 'planning',
    accent: '#fdba74',
    defaultSize: { width: 280, height: C * 3 },
    defaultData: () => {
      const target = new Date()
      target.setDate(target.getDate() + 14)
      return { label: 'Deadline', targetDate: target.toISOString().slice(0, 10) }
    },
  },
  progress: {
    type: 'progress',
    label: 'Progress',
    description: 'A labeled 0–100% progress bar',
    icon: Gauge,
    category: 'planning',
    accent: '#a3e635',
    defaultSize: { width: 280, height: C * 3 },
    defaultData: () => ({ label: 'Progress', percent: 40 }),
  },
  poll: {
    type: 'poll',
    label: 'Poll',
    description: 'Options with tap-to-vote counts',
    icon: Vote,
    category: 'planning',
    accent: '#f0abfc',
    defaultSize: { width: 300, height: C * 5 },
    defaultData: () => ({
      question: 'Which direction?',
      options: [
        { id: uid(), label: 'Option A', votes: 0 },
        { id: uid(), label: 'Option B', votes: 0 },
      ],
    }),
  },
  rating: {
    type: 'rating',
    label: 'Rating',
    description: 'A labeled 5-star rating',
    icon: Star,
    category: 'data',
    accent: '#fbbf24',
    defaultSize: { width: 260, height: C * 3 },
    defaultData: () => ({ label: 'Rate it', value: 0 }),
  },
  calculator: {
    type: 'calculator',
    label: 'Calculator',
    description: 'A pocket calculator — type or tap',
    icon: Calculator,
    category: 'data',
    accent: '#a7f3d0',
    defaultSize: { width: 240, height: C * 7 },
    defaultData: () => ({ expression: '', result: '' }),
  },
  bar_chart: {
    type: 'bar_chart',
    label: 'Bar Chart',
    description: 'Labeled values as horizontal bars',
    icon: BarChart3,
    category: 'data',
    accent: '#7dd3fc',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({
      title: 'Chart',
      bars: [
        { id: uid(), label: 'A', value: 3 },
        { id: uid(), label: 'B', value: 5 },
      ],
    }),
  },
  table: {
    type: 'table',
    label: 'Table',
    description: 'Editable grid with a header row',
    icon: Table2,
    category: 'data',
    accent: '#94a3b8',
    defaultSize: { width: 360, height: C * 4 },
    defaultData: () => ({
      rows: [
        ['Item', 'Owner', 'Status'],
        ['', '', ''],
        ['', '', ''],
      ],
    }),
  },
  budget: {
    type: 'budget',
    label: 'Budget',
    description: 'Line items with a running total',
    icon: CircleDollarSign,
    category: 'data',
    accent: '#fde047',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({
      currency: '$',
      items: [
        { id: uid(), label: 'Hosting', amount: 12 },
        { id: uid(), label: 'Domain', amount: 15 },
      ],
    }),
  },
  metrics: {
    type: 'metrics',
    label: 'Metrics',
    description: 'KPI tiles with value, unit, and trend',
    icon: ChartNoAxesColumn,
    category: 'data',
    accent: '#67e8f9',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({
      tiles: [
        { id: uid(), label: 'Users', value: '128', unit: '', trend: 'up' },
        { id: uid(), label: 'Revenue', value: '3.2', unit: 'k', trend: 'flat' },
      ],
    }),
  },
  timer: {
    type: 'timer',
    label: 'Timer',
    description: 'A countdown timer with start, pause, and reset',
    icon: Timer,
    category: 'tracking',
    accent: '#86efac',
    defaultSize: { width: 240, height: C * 4 },
    defaultData: () => ({ label: 'Timer', durationSeconds: 300, remainingSeconds: 300, endAt: null }),
  },
  mood_tracker: {
    type: 'mood_tracker',
    label: 'Mood Tracker',
    description: 'A weekly mood log — tap a day to cycle through',
    icon: Smile,
    category: 'tracking',
    accent: '#fde047',
    defaultSize: { width: 300, height: C * 3 },
    defaultData: () => ({ days: [null, null, null, null, null, null, null] }),
  },
  counter: {
    type: 'counter',
    label: 'Counter',
    description: 'A tally counter — one number, step-adjustable',
    icon: Hash,
    category: 'tracking',
    accent: '#93c5fd',
    defaultSize: { width: 260, height: C * 4 },
    defaultData: () => ({ label: 'Tally', count: 0, step: 1 }),
  },
  links: {
    type: 'links',
    label: 'Link List',
    description: 'Labelled external links, click to open',
    icon: Link2,
    category: 'tracking',
    accent: '#93c5fd',
    defaultSize: { width: 300, height: C * 4 },
    defaultData: () => ({
      items: [{ id: uid(), label: 'grovepad', url: 'https://example.com' }],
    }),
  },
  habit: {
    type: 'habit',
    label: 'Habit Tracker',
    description: 'A weekly streak grid for one habit',
    icon: Flame,
    category: 'tracking',
    accent: '#fdba74',
    defaultSize: { width: 300, height: C * 3 },
    defaultData: () => ({ label: 'Daily habit', days: [false, false, false, false, false, false, false], streak: 0 }),
  },
  contact: {
    type: 'contact',
    label: 'Contact Card',
    description: 'Name, role, and how to reach them',
    icon: Contact,
    category: 'tracking',
    accent: '#d8b4fe',
    defaultSize: { width: 300, height: C * 4 },
    defaultData: () => ({ name: '', role: '', email: '', phone: '' }),
  },
  color_palette: {
    type: 'color_palette',
    label: 'Color Palette',
    description: 'A swatch board — click a hue to copy its hex',
    icon: Palette,
    category: 'media',
    accent: '#f0abfc',
    defaultSize: { width: 260, height: C * 4 },
    defaultData: () => ({ colors: ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24'] }),
  },
  media: {
    type: 'media',
    label: 'Media',
    description: 'An image by URL with a caption',
    icon: Image,
    category: 'media',
    accent: '#f9a8d4',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({ url: '', caption: '' }),
  },
  sketchpad: {
    type: 'sketchpad',
    label: 'Sketchpad',
    description: 'Rough drawing surface',
    icon: PenTool,
    category: 'media',
    accent: '#fcd34d',
    defaultSize: { width: 360, height: C * 5 },
    defaultData: () => ({ height: 160 }),
  },
  dialog: {
    type: 'dialog',
    label: 'Dialog',
    description: 'Script lines by character',
    icon: MessagesSquare,
    category: 'media',
    accent: '#a5b4fc',
    defaultSize: { width: 360, height: C * 5 },
    defaultData: () => ({
      lines: [
        {
          id: uid(),
          character: 'NARRATOR',
          cue: 'The canvas stretches on, in every direction.',
        },
      ],
    }),
  },
  ai_generator: {
    type: 'ai_generator',
    label: 'AI Generator',
    description: 'Prompt-driven content generator',
    icon: Sparkles,
    category: 'media',
    accent: '#a3e635',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({ prompt: '', status: 'idle' }),
  },
  text_input: {
    type: 'text_input',
    label: 'Text Input',
    description: 'A clean text value that can feed any connected branch',
    icon: TextCursorInput,
    category: 'data',
    accent: '#f472b6',
    defaultSize: { width: 280, height: C * 3 },
    defaultData: () => ({
      label: 'Input',
      value: '',
      placeholder: 'Type a value…',
      multiline: false,
    }),
  },
  number_input: {
    type: 'number_input',
    label: 'Number Input',
    description: 'A bounded number, slider, and stepper for live calculations',
    icon: Hash,
    category: 'data',
    accent: '#38bdf8',
    defaultSize: { width: 280, height: C * 4 },
    defaultData: () => ({ label: 'Value', value: 0, min: 0, max: 100, step: 1 }),
  },
  toggle: {
    type: 'toggle',
    label: 'Toggle',
    description: 'A simple on/off condition for gates, triggers, and branches',
    icon: ToggleRight,
    category: 'data',
    accent: '#fbbf24',
    defaultSize: { width: 240, height: C * 3 },
    defaultData: () => ({ label: 'Condition', value: false }),
  },
  branch_gate: {
    type: 'branch_gate',
    label: 'Bool Gate',
    description: 'A true/false condition with both normal and inverse outputs',
    icon: Binary,
    category: 'structure',
    accent: '#a78bfa',
    defaultSize: { width: C * 7, height: C * 3 },
    sizing: { minWidth: C * 4, minHeight: C * 2 },
    defaultData: () => ({
      value: false,
      trueLabel: 'Yes',
      falseLabel: 'No',
      trueNote: '',
      falseNote: '',
    }),
  },
  formula: {
    type: 'formula',
    label: 'Formula',
    description: 'Combine two connected numbers and publish the live result',
    icon: FunctionSquare,
    category: 'data',
    accent: '#818cf8',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({ label: 'Calculation', a: 0, b: 0, operator: 'add' }),
  },
  status: {
    type: 'status',
    label: 'Status',
    description: 'A universal workflow state with progress and completion outputs',
    icon: Gauge,
    category: 'tracking',
    accent: '#34d399',
    defaultSize: { width: 280, height: C * 3 },
    defaultData: () => ({ label: 'Status', value: 'not_started' }),
  },
  date_picker: {
    type: 'date_picker',
    label: 'Date & Time',
    description: 'A target moment with days-until and due-state outputs',
    icon: CalendarClock,
    category: 'planning',
    accent: '#fb923c',
    defaultSize: { width: 280, height: C * 4 },
    defaultData: () => ({ label: 'Target date', date: todayISO(), time: '', includeTime: false }),
  },
  outline: {
    type: 'outline',
    label: 'Outline',
    description: 'A keyboard-friendly nested outline for structuring ideas',
    icon: List,
    category: 'notes',
    accent: '#60a5fa',
    defaultSize: { width: 360, height: C * 6 },
    defaultData: () => ({
      items: [{ id: uid(), text: 'First idea', depth: 0, collapsed: false }],
    }),
  },
  form: {
    type: 'form',
    label: 'Form',
    description: 'Build and complete a compact form with required-field tracking',
    icon: ClipboardList,
    category: 'data',
    accent: '#2dd4bf',
    defaultSize: { width: 400, height: C * 7 },
    defaultData: () => ({
      title: 'Quick form',
      fields: [{ id: uid(), label: 'Name', type: 'text', value: '', required: true }],
    }),
  },
  daily_agenda: {
    type: 'daily_agenda',
    label: 'Daily Agenda',
    description: 'A focused schedule of timed, completable items for one day',
    icon: CalendarRange,
    category: 'planning',
    accent: '#7dd3fc',
    defaultSize: { width: 360, height: C * 7 },
    defaultData: () => ({
      date: todayISO(),
      items: [{ id: uid(), time: '09:00', title: 'First item', done: false }],
    }),
  },
  process: {
    type: 'process',
    label: 'Process / SOP',
    description: 'A sequential procedure with one active step and live progress',
    icon: Workflow,
    category: 'planning',
    accent: '#a3e635',
    defaultSize: { width: 360, height: C * 6 },
    defaultData: () => ({
      steps: [{ id: uid(), label: 'First step', status: 'active' }],
    }),
  },
  risk_register: {
    type: 'risk_register',
    label: 'Risk Register',
    description: 'Score likelihood and impact, record mitigation, resolve risks',
    icon: ShieldAlert,
    category: 'planning',
    accent: '#fb7185',
    defaultSize: { width: 440, height: C * 6 },
    defaultData: () => ({
      items: [
        {
          id: uid(),
          risk: 'New risk',
          likelihood: 3,
          impact: 3,
          mitigation: '',
          status: 'open',
        },
      ],
    }),
  },
  decision_matrix: {
    type: 'decision_matrix',
    label: 'Decision Matrix',
    description: 'Compare options against weighted criteria and reveal a winner',
    icon: Grid2x2,
    category: 'planning',
    accent: '#c084fc',
    defaultSize: { width: 440, height: C * 6 },
    defaultData: () => ({
      criteria: [{ id: uid(), label: 'Value', weight: 1 }],
      options: [
        { id: uid(), label: 'Option A', scores: [3] },
        { id: uid(), label: 'Option B', scores: [3] },
      ],
    }),
  },
  swot: {
    type: 'swot',
    label: 'SWOT Analysis',
    description: 'Strengths, weaknesses, opportunities, and threats in one view',
    icon: Columns3,
    category: 'planning',
    accent: '#f59e0b',
    defaultSize: { width: 400, height: C * 6 },
    defaultData: () => ({ strengths: [''], weaknesses: [''], opportunities: [''], threats: [''] }),
  },
  timesheet: {
    type: 'timesheet',
    label: 'Timesheet',
    description: 'Log hours, mark billable work, and calculate live totals',
    icon: Timer,
    category: 'tracking',
    accent: '#22d3ee',
    defaultSize: { width: 400, height: C * 6 },
    defaultData: () => ({
      currency: '$',
      hourlyRate: 0,
      entries: [{ id: uid(), date: todayISO(), label: 'Work', hours: 1, billable: true }],
    }),
  },
  inventory: {
    type: 'inventory',
    label: 'Inventory',
    description: 'Track quantities and immediately surface low-stock items',
    icon: Package,
    category: 'tracking',
    accent: '#facc15',
    defaultSize: { width: 400, height: C * 6 },
    defaultData: () => ({
      items: [{ id: uid(), name: 'Item', quantity: 1, minimum: 0, unit: 'pcs' }],
    }),
  },
  logbook: {
    type: 'logbook',
    label: 'Logbook',
    description: 'A chronological record of timestamped notes and warnings',
    icon: BookMarked,
    category: 'notes',
    accent: '#94a3b8',
    defaultSize: { width: 360, height: C * 6 },
    defaultData: () => ({
      entries: [{ id: uid(), timestamp: new Date().toISOString(), text: 'First entry', level: 'note' }],
    }),
  },
  line_chart: {
    type: 'line_chart',
    label: 'Line Chart',
    description: 'Plot an editable trend with latest, average, and maximum outputs',
    icon: ChartLine,
    category: 'data',
    accent: '#38bdf8',
    defaultSize: { width: 400, height: C * 6 },
    defaultData: () => ({
      title: 'Trend',
      unit: '',
      points: [
        { id: uid(), label: 'A', value: 3 },
        { id: uid(), label: 'B', value: 5 },
        { id: uid(), label: 'C', value: 4 },
      ],
    }),
  },
  pie_chart: {
    type: 'pie_chart',
    label: 'Donut Chart',
    description: 'A lightweight share breakdown with editable colors and values',
    icon: ChartPie,
    category: 'data',
    accent: '#f472b6',
    defaultSize: { width: 360, height: C * 7 },
    defaultData: () => ({
      title: 'Breakdown',
      mode: 'donut',
      segments: [
        { id: uid(), label: 'A', value: 60, color: '#38bdf8' },
        { id: uid(), label: 'B', value: 40, color: '#a3e635' },
      ],
    }),
  },
  unit_converter: {
    type: 'unit_converter',
    label: 'Unit Converter',
    description: 'Fast local conversions for length, mass, temperature, and time',
    icon: ArrowLeftRight,
    category: 'data',
    accent: '#34d399',
    defaultSize: { width: 320, height: C * 5 },
    defaultData: () => ({ category: 'length', value: 1, from: 'm', to: 'ft', precision: 2 }),
  },
  game_tuner: {
    type: 'game_tuner',
    label: 'Game Mechanics Tuner',
    description: 'Sliders for tuning game feel',
    icon: Gamepad2,
    category: 'specialist',
    accent: '#c4b5fd',
    defaultSize: { width: 320, height: C * 4 },
    defaultData: () => ({ grip: 50, drift: 20, stability: 80 }),
    pack: 'game_dev',
  },
  audio_player: {
    type: 'audio_player',
    label: 'Synthesizer & Audio Player',
    description: 'BPM, key, and signal chain scratchpad',
    icon: AudioLines,
    category: 'specialist',
    accent: '#7dd3fc',
    defaultSize: { width: 360, height: C * 5 },
    defaultData: () => ({
      bpm: 120,
      key: 'C Minor',
      signalChain: 'Chorus -> Delay -> Reverb',
      isPlaying: false,
    }),
    pack: 'music_production',
  },
  ...EXPANSION_WIDGET_DEFINITIONS,
  ...ATLAS_WIDGET_DEFINITIONS,
  ...AUTOMATION_CORE_DEFINITIONS,
}

// Apply the domain pack requirements from MODULE_PACK_REQUIREMENTS dynamically
for (const type of Object.keys(WIDGET_REGISTRY) as ModuleType[]) {
  const pack = MODULE_PACK_REQUIREMENTS[type]
  if (pack) {
    WIDGET_REGISTRY[type].pack = pack
  } else {
    delete WIDGET_REGISTRY[type].pack
  }
}

// Apply the calibrated 35-widget content-safety profiles after generated
// families and local declarations meet. Existing per-type values remain the
// base, so a profile only replaces the axes it intentionally owns.
for (const [type, sizing] of Object.entries(REVIEWED_WIDGET_SIZING) as Array<
  [keyof typeof REVIEWED_WIDGET_SIZING, WidgetSizing]
>) {
  WIDGET_REGISTRY[type].sizing = { ...WIDGET_REGISTRY[type].sizing, ...sizing }
}

export function widgetDefinition(type: ModuleType): WidgetDefinition {
  return WIDGET_REGISTRY[type]
}

/** All definitions in stable picker order (category order, then label). */
const ORDERED_DEFINITIONS: readonly WidgetDefinition[] = (() => {
  const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
  for (const def of Object.values(WIDGET_REGISTRY)) {
    const list = byCategory.get(def.category)
    if (list) list.push(def)
    else byCategory.set(def.category, [def])
  }
  const result: WidgetDefinition[] = []
  for (const category of CATEGORY_ORDER) {
    const defs = byCategory.get(category)
    if (!defs) continue
    defs.sort((a, b) => a.label.localeCompare(b.label))
    result.push(...defs)
  }
  return Object.freeze(result)
})()

export function orderedDefinitions(): readonly WidgetDefinition[] {
  return ORDERED_DEFINITIONS
}

// ---------------------------------------------------------------------------
// AI import catalog — the document importer shows the model the full widget
// database so it picks the best-fit type from all of them, not a hardcoded
// handful. Both the human-readable catalog and the schema enum are derived
// from WIDGET_REGISTRY here, so a new widget type becomes AI-selectable the
// moment its registry entry lands — nothing to keep in sync by hand.
// ---------------------------------------------------------------------------

/**
 * Types the importer must not spawn from a topology plan. `canvas_node` needs
 * a store-created backing canvas (its default data carries an empty canvasId
 * that only the store fills in), so it can't be materialized from a plain
 * mindmap import.
 */
const IMPORT_EXCLUDED_TYPES = new Set<ModuleType>(['canvas_node'])

/** Every widget type the AI importer may choose, in stable picker order. */
export const IMPORT_SELECTABLE_TYPES: readonly ModuleType[] = ORDERED_DEFINITIONS
  .map((def) => def.type)
  .filter((type) => !IMPORT_EXCLUDED_TYPES.has(type))

/**
 * Full catalog of selectable widget types as prompt text, grouped by category:
 *   ## Category
 *   - "type" — Label: description
 * Fed to the topology pass so type selection is informed by the whole database.
 */
export function importTypeCatalog(): string {
  const byCategory = new Map<WidgetCategory, WidgetDefinition[]>()
  for (const def of ORDERED_DEFINITIONS) {
    if (IMPORT_EXCLUDED_TYPES.has(def.type)) continue
    const list = byCategory.get(def.category)
    if (list) list.push(def)
    else byCategory.set(def.category, [def])
  }
  const blocks: string[] = []
  for (const category of CATEGORY_ORDER) {
    const defs = byCategory.get(category)
    if (!defs || defs.length === 0) continue
    const lines = defs.map((d) => `- "${d.type}" — ${d.label}: ${d.description}`)
    blocks.push(`## ${CATEGORY_LABELS[category]}\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}
