import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Columns3,
  Dices,
  Flag,
  GalleryHorizontalEnd,
  Grid2x2,
  Inbox,
  Link2,
  ListChecks,
  Repeat,
  RotateCcw,
  Scale,
  ShoppingCart,
} from 'lucide-react'
import type { WidgetDefinition } from '../contracts/registry'
import { localDayKey } from '../../utils/localDate'
import { C, uid } from './definitionHelpers'

/** Planning widgets (checklist … meeting_notes). Extracted verbatim from registry.ts; key order preserved. */
export const PLANNING_WIDGET_DEFINITIONS = {
  checklist: {
    type: 'checklist',
    label: 'Tasks',
    description: 'One task collection worn as a list, a queue, a board, a week, or a plan',
    icon: ListChecks,
    category: 'planning',
    accent: '#86efac',
    // A task list is a column of rows: narrow, and exactly as tall as it has
    // tasks. The skins that lay tasks out in two dimensions are canvases, so
    // they keep the handle and a wider floor. `SPATIAL_SKINS` in
    // taskSkinModel.ts is the renderer's copy of this list, and
    // taskSkins.test.ts holds the two in agreement.
    defaultSize: { width: C * 7, height: C * 4 },
    sizing: {
      minWidth: C * 6,
      autoHeight: true,
      fixed: (data) => !['week', 'board', 'timeline', 'matrix', 'sprint']
        .includes((data as { mode?: string } | null)?.mode ?? 'list'),
    },
    defaultData: () => ({ mode: 'list', items: [{ id: uid(), label: 'New task', done: false, status: 'todo', due: '', day: 0, time: '09:00', start: 0, span: 1, quadrant: 0 }] }),
    // Declared here in full so every skin wears an icon that says what it is:
    // the catalogue merge only fills gaps, and its generated entries fall back
    // to one icon per presentation family, which put the same glyph on Sprint,
    // Routine, and Dependencies.
    rendererOwnedSkinDetails: ['recurring', 'sprint', 'dependencies', 'routine'],
    skins: [
      { value: 'list', label: 'List', icon: ListChecks, presentation: 'standard', accent: '#86efac' },
      {
        value: 'inbox',
        label: 'Inbox',
        description: 'A zero-organization capture queue for tasks that will be sorted later.',
        implementation: 'renderer-ready',
        presentation: 'standard',
        icon: Inbox,
        accent: '#e472b1',
      },
      {
        value: 'shopping',
        label: 'Shopping',
        description: 'Large tap targets, quantities, and completed-item grouping for errands.',
        implementation: 'renderer-ready',
        presentation: 'standard',
        icon: ShoppingCart,
        accent: '#72e4a1',
      },
      { value: 'assignments', label: 'Assignments', icon: ClipboardList, presentation: 'ledger', accent: '#c4b5fd' },
      { value: 'day', label: 'Day', icon: CalendarRange, presentation: 'time', accent: '#fbbf24' },
      { value: 'week', label: 'Week', icon: CalendarDays, presentation: 'grid', accent: '#fb923c' },
      { value: 'board', label: 'Board', icon: Columns3, presentation: 'board', accent: '#38bdf8' },
      { value: 'timeline', label: 'Timeline', icon: GalleryHorizontalEnd, presentation: 'timeline', accent: '#5eead4' },
      { value: 'matrix', label: 'Priority Matrix', icon: Grid2x2, presentation: 'matrix', accent: '#f472b6' },
      {
        value: 'recurring',
        label: 'Recurring',
        description: 'Repeats items on daily, weekly, monthly, or completion-relative schedules.',
        implementation: 'schema-extension',
        presentation: 'timeline',
        icon: Repeat,
        accent: '#e4a772',
      },
      {
        value: 'sprint',
        label: 'Sprint',
        description: 'Adds owner, estimate, sprint, and done-definition fields to the board view.',
        implementation: 'schema-extension',
        presentation: 'board',
        icon: Flag,
        accent: '#e47772',
      },
      {
        value: 'dependencies',
        label: 'Dependencies',
        description: 'Shows blocked tasks and prerequisite links within the task collection.',
        implementation: 'schema-extension',
        presentation: 'standard',
        icon: Link2,
        accent: '#e472c9',
      },
      {
        value: 'routine',
        label: 'Routine',
        description: 'Runs the same ordered checklist repeatedly while preserving completion history.',
        implementation: 'schema-extension',
        presentation: 'ledger',
        icon: RotateCcw,
        accent: '#72e4de',
      },
    ],
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
    description: 'Choose simply or use weighted, no-repeat decisions',
    icon: Dices,
    category: 'planning',
    accent: '#f0abfc',
    defaultSize: { width: 300, height: C * 5 },
    defaultData: () => ({ question: '', options: ['', ''], pickedIndex: null, mode: 'simple', weights: [1, 1], history: [], lastRolledAt: null, noRepeatWindow: 1 }),
    skins: [
      { value: 'simple', label: 'Simple', icon: Dices, accent: '#f0abfc' },
      { value: 'weighted', label: 'Weighted', icon: Scale, accent: '#a78bfa' },
    ],
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
      date: localDayKey(),
      attendees: '',
      notes: '',
      actions: [],
    }),
  },
} satisfies Record<string, WidgetDefinition>
