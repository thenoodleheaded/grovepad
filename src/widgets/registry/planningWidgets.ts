import {
  CalendarRange,
  ClipboardList,
  Columns3,
  Dices,
  GalleryHorizontalEnd,
  Grid2x2,
  ListChecks,
  Scale,
} from 'lucide-react'
import type { WidgetDefinition } from '../contracts/registry'
import { localDayKey } from '../../utils/localDate'
import { C, uid } from './definitionHelpers'

/** Planning widgets (checklist … meeting_notes). Extracted verbatim from registry.ts; key order preserved. */
export const PLANNING_WIDGET_DEFINITIONS = {
  checklist: {
    type: 'checklist',
    label: 'Tasks',
    description: 'One task collection with list, board, schedule, and priority views',
    icon: ListChecks,
    category: 'planning',
    accent: '#86efac',
    // A task list is a column of rows: narrow, and exactly as tall as it has
    // tasks. The board/schedule/priority views are canvases, so they keep the
    // handle and a wider floor.
    defaultSize: { width: C * 7, height: C * 4 },
    sizing: {
      minWidth: C * 6,
      autoHeight: true,
      fixed: (data) => (data as { mode?: string } | null)?.mode !== 'board'
        && (data as { mode?: string } | null)?.mode !== 'assignments'
        && (data as { mode?: string } | null)?.mode !== 'schedule'
        && (data as { mode?: string } | null)?.mode !== 'priority',
    },
    defaultData: () => ({ mode: 'list', items: [{ id: uid(), label: 'New task', done: false, status: 'todo', due: '', day: 0, time: '09:00', start: 0, span: 1, quadrant: 0 }] }),
    skins: [
      { value: 'list', label: 'List', icon: ListChecks, accent: '#86efac' },
      { value: 'board', label: 'Board', icon: Columns3, accent: '#38bdf8' },
      { value: 'assignments', label: 'Assignments', icon: ClipboardList, accent: '#c4b5fd' },
      { value: 'day', label: 'Day', icon: CalendarRange, accent: '#fbbf24' },
      { value: 'week', label: 'Week', icon: CalendarRange, accent: '#fb923c' },
      { value: 'timeline', label: 'Timeline', icon: GalleryHorizontalEnd, accent: '#5eead4' },
      { value: 'matrix', label: 'Priority Matrix', icon: Grid2x2, accent: '#f472b6' },
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
