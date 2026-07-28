// The launch-video demo board: one workspace, nine canvases, every major
// Grovepad ability on camera.
//
//   Launch Board            the hub — Canvas cards into every world below
//   ├── Semester HQ         school and study tracking
//   │   ├── Exam Sprint     a wired study circuit (automation, in context)
//   │   └── Lecture Vault   notes, sources, sketches
//   ├── Money Center        budgets, debt, subscriptions, savings
//   │   └── Freelance Studio  invoicing, time, scope, pipeline
//   ├── Life Systems        home, health, routine
//   ├── Studio              creative and project work
//   └── Automation Lab      the pure circuit showcase
//
// Dates are computed from the build date, so re-running the generator gives
// the film fresh deadlines rather than a board full of expired ones.

import { DemoBoard } from './demoBoardKit'
import { localDayKey, localDayKeyInDays } from '../../src/utils/localDate'

const today = localDayKey()
const inDays = (days: number) => localDayKeyInDays(days)

// -- small shapes the content repeats ---------------------------------------

let seq = 0
const rid = (prefix: string) => `${prefix}-${++seq}`

/** A checklist row. Skins read different slots off the same row. */
const task = (
  label: string,
  extra: Partial<{
    done: boolean
    status: 'todo' | 'doing' | 'done'
    due: string
    day: number
    time: string
    start: number
    span: number
    quadrant: 0 | 1 | 2 | 3
  }> = {},
) => ({
  id: rid('task'),
  label,
  done: extra.done ?? false,
  status: extra.status ?? (extra.done ? 'done' : 'todo'),
  due: extra.due ?? '',
  day: extra.day ?? 0,
  time: extra.time ?? '09:00',
  start: extra.start ?? 0,
  span: extra.span ?? 1,
  quadrant: extra.quadrant ?? 0,
})

/** One row of the shared Atlas envelope every tracker-family card carries. */
const row = (
  label: string,
  value: number,
  extra: Partial<{ done: boolean; date: string; status: string; note: string }> = {},
) => ({
  id: rid('row'),
  label,
  value,
  done: extra.done ?? false,
  date: extra.date ?? today,
  status: extra.status ?? 'active',
  note: extra.note ?? '',
})

/** A tracker card's data: the Atlas slots plus its rows. */
const atlas = (
  trackerMode: string,
  label: string,
  slots: Partial<{
    primary: number
    secondary: number
    target: number
    text: string
    date: string
    timeStart: string
    timeEnd: string
    items: ReturnType<typeof row>[]
    history: Array<{ t: number; v: number }>
  }>,
) => ({
  label,
  trackerMode,
  mode: 'standard',
  primary: slots.primary ?? 0,
  secondary: slots.secondary ?? 0,
  target: slots.target ?? 100,
  text: slots.text ?? '',
  date: slots.date ?? today,
  timeStart: slots.timeStart ?? '09:00',
  timeEnd: slots.timeEnd ?? '17:00',
  enabled: true,
  privateMode: false,
  actionCount: 0,
  lastActionAt: null,
  items: slots.items ?? [],
  history: slots.history ?? [],
  times: {},
})

/** A short series for the chart/trend fields, walking a value over N points. */
const series = (values: number[]) =>
  values.map((v, i) => ({ t: Date.UTC(2026, 0, 1) + i * 86_400_000, v }))

const bars = (entries: Array<[string, number]>, colors: string[]) =>
  entries.map(([label, value], i) => ({
    id: rid('bar'),
    label,
    value,
    color: colors[i % colors.length]!,
  }))

const AZURE = '#38bdf8'
const LIME = '#a3e635'
const ROSE = '#f472b6'
const AMBER = '#fbbf24'
const VIOLET = '#c084fc'

// ===========================================================================

export function buildLaunchShowcase(): DemoBoard {
  const board = new DemoBoard('Grovepad Showcase', 'Launch Board')

  const hub = board.root({ lanes: 3 })
  const school = board.canvas('Semester HQ', hub, { lanes: 4 })
  // The two circuit canvases read left to right — inputs, logic, outputs — so
  // their groups keep their own lanes rather than being balanced.
  const sprint = board.canvas('Exam Sprint', school, { lanes: 4, strict: true })
  const vault = board.canvas('Lecture Vault', school, { lanes: 3 })
  const money = board.canvas('Money Center', hub, { lanes: 4 })
  const freelance = board.canvas('Freelance Studio', money, { lanes: 4 })
  const life = board.canvas('Life Systems', hub, { lanes: 4 })
  const studio = board.canvas('Studio', hub, { lanes: 4 })
  const lab = board.canvas('Automation Lab', hub, { lanes: 4, strict: true })

  // -- 1. Launch Board — the hub --------------------------------------------

  hub.column([
    {
      key: 'welcome',
      type: 'notes',
      title: 'Grovepad',
      skin: 'callout',
      data: {
        text: 'One surface for everything you are keeping track of.\n\nEvery card below opens a world. Nothing here lives in a folder.',
        mode: 'callout',
      },
      accent: LIME,
      favorite: true,
    },
    {
      key: 'today-note',
      type: 'notes',
      title: 'Today',
      skin: 'sticky',
      data: { text: 'Calculus problem set\nRent transfer\nGym at 6', mode: 'sticky', color: 'yellow' },
    },
    {
      glue: 'Right now',
      cards: [
        {
          key: 'focus',
          type: 'timekeeper',
          title: 'Focus',
          skin: 'pomodoro',
          data: {
            mode: 'pomodoro',
            pomodoro: {
              label: 'Deep work',
              workMinutes: 25,
              breakMinutes: 5,
              phase: 'work',
              endAt: null,
              remainingSeconds: 1500,
              completed: 3,
            },
          },
        },
        {
          key: 'today-list',
          type: 'checklist',
          title: 'Today',
          skin: 'day',
          data: {
            mode: 'day',
            items: [
              task('Problem set 7', { time: '09:30', done: true }),
              task('Lecture — Series convergence', { time: '11:00' }),
              task('Move rent to joint account', { time: '14:00' }),
              task('Gym — lower body', { time: '18:00' }),
            ],
          },
        },
        {
          key: 'streak',
          type: 'habit',
          title: 'Study streak',
          skin: 'chain',
          data: { label: 'Revision done', days: [true, true, true, true, false, true, true], streak: 12, skin: 'chain' },
        },
      ],
    },
  ])

  hub.column([
    {
      key: 'week',
      type: 'metrics',
      title: 'This week',
      skin: 'kpi_tiles',
      data: {
        tiles: [
          { id: rid('tile'), label: 'Study hours', value: '17.5', unit: 'h', trend: 'up' },
          { id: rid('tile'), label: 'Spent', value: '412', unit: '$', trend: 'down' },
          { id: rid('tile'), label: 'Saved', value: '380', unit: '$', trend: 'up' },
          { id: rid('tile'), label: 'Tasks done', value: '31', unit: '', trend: 'up' },
        ],
      },
    },
    {
      key: 'door-school',
      type: 'canvas_node',
      title: 'Semester HQ',
      skin: 'live_thumbnail',
      accent: AZURE,
    },
    {
      key: 'door-money',
      type: 'canvas_node',
      title: 'Money Center',
      skin: 'cover',
      accent: LIME,
    },
    {
      key: 'door-life',
      type: 'canvas_node',
      title: 'Life Systems',
      skin: 'dashboard_door',
      accent: ROSE,
    },
  ])

  hub.column([
    {
      key: 'countdown',
      type: 'timekeeper',
      title: 'Finals begin',
      skin: 'deadline',
      data: { mode: 'deadline', deadline: { label: 'Finals week', targetDate: inDays(46) } },
      badges: [{ type: 'deadline_countdown', dueDate: inDays(46) }],
    },
    {
      key: 'door-studio',
      type: 'canvas_node',
      title: 'Studio',
      skin: 'portal',
      accent: VIOLET,
    },
    {
      key: 'door-lab',
      type: 'canvas_node',
      title: 'Automation Lab',
      skin: 'folder_index',
      accent: AMBER,
    },
    {
      key: 'hub-status',
      type: 'status',
      title: 'Semester',
      skin: 'pipeline',
      data: { label: 'Semester', value: 'in_progress' },
    },
  ])

  board.link(hub, 'door-school', school)
  board.link(hub, 'door-money', money)
  board.link(hub, 'door-life', life)
  board.link(hub, 'door-studio', studio)
  board.link(hub, 'door-lab', lab)

  hub.tree('welcome', ['door-school', 'door-money', 'door-life', 'door-studio', 'door-lab'])
  hub.rel('today-note', 'today-list', 'cousin')
  hub.wire({ from: 'today-list', fromPort: 'done_count', to: 'week', toPort: 'value_1' })

  // -- 2. Semester HQ -------------------------------------------------------

  school.column([
    {
      key: 'term',
      type: 'notes',
      title: 'Autumn term',
      skin: 'markdown_page',
      data: {
        mode: 'markdown_page',
        text: '# Autumn term\n\n**Load** — 5 courses, 17 credits\n**Target** — hold a 3.7\n**Weak spot** — Calculus II series\n\nRevision blocks are 25 minutes. Two before dinner, one after.',
      },
      accent: AZURE,
    },
    {
      key: 'assignments',
      type: 'checklist',
      title: 'Assignments',
      skin: 'assignments',
      data: {
        mode: 'assignments',
        items: [
          task('Calculus II — Problem set 7', { due: inDays(2), status: 'doing' }),
          task('Linear Algebra — Proof writeup', { due: inDays(5) }),
          task('Statistics — Lab 4 report', { due: inDays(9) }),
          task('History — Source analysis', { due: inDays(12) }),
          task('Calculus II — Problem set 6', { due: inDays(-5), done: true }),
          task('Statistics — Lab 3 report', { due: inDays(-8), done: true }),
        ],
      },
      badges: [{ type: 'priority_flag', level: 'high' }],
    },
    {
      key: 'weekplan',
      type: 'checklist',
      title: 'Week plan',
      skin: 'week',
      data: {
        mode: 'week',
        items: [
          task('Series convergence — reread', { day: 0, time: '09:00' }),
          task('Problem set 7', { day: 1, time: '10:00' }),
          task('Study group', { day: 2, time: '16:00' }),
          task('Past paper, timed', { day: 3, time: '14:00' }),
          task('Flashcard review', { day: 4, time: '08:30' }),
          task('Lab writeup', { day: 5, time: '11:00' }),
        ],
      },
    },
    {
      key: 'courses',
      type: 'table',
      title: 'Courses',
      skin: 'compact_ledger',
      data: {
        rows: [
          ['Course', 'Room', 'Weight'],
          ['Calculus II', 'Sci 214', '4 cr'],
          ['Linear Algebra', 'Sci 118', '4 cr'],
          ['Statistics', 'Hale 3', '3 cr'],
          ['History of Science', 'Ash 9', '3 cr'],
          ['Academic Writing', 'Ash 2', '3 cr'],
        ],
      },
    },
  ])

  school.column([
    {
      key: 'grades',
      type: 'grade_calc',
      title: 'Calculus II',
      skin: 'weighted',
      data: {
        mode: 'weighted',
        components: [
          { id: rid('comp'), name: 'Midterm', score: 78, weight: 25 },
          { id: rid('comp'), name: 'Problem sets', score: 91, weight: 20 },
          { id: rid('comp'), name: 'Labs', score: 88, weight: 15 },
          { id: rid('comp'), name: 'Final', score: 0, weight: 40 },
        ],
      },
    },
    {
      key: 'gpa',
      type: 'grade_calc',
      title: 'GPA',
      skin: 'gpa',
      data: {
        mode: 'gpa',
        gpa: {
          courses: [
            { id: rid('course'), name: 'Calculus II', credits: 4, points: 3.3 },
            { id: rid('course'), name: 'Linear Algebra', credits: 4, points: 4 },
            { id: rid('course'), name: 'Statistics', credits: 3, points: 3.7 },
            { id: rid('course'), name: 'History of Science', credits: 3, points: 4 },
            { id: rid('course'), name: 'Academic Writing', credits: 3, points: 3.7 },
          ],
        },
      },
    },
    {
      glue: 'Progress',
      cards: [
        {
          key: 'quizscores',
          type: 'bar_chart',
          title: 'Paper scores',
          skin: 'line',
          data: {
            title: 'Timed papers',
            mode: 'line',
            unit: '%',
            bars: bars(
              [['P1', 58], ['P2', 61], ['P3', 66], ['P4', 64], ['P5', 71], ['P6', 74]],
              [AZURE],
            ),
          },
        },
        {
          key: 'hours',
          type: 'goal_tracker',
          title: 'Study hours',
          skin: 'hours',
          data: {
            mode: 'hours',
            goal: 'Logged revision',
            hours: { subject: 'Calculus II', targetHours: 60, loggedHours: 41 },
          },
        },
        {
          key: 'term-progress',
          type: 'goal_tracker',
          title: 'Term progress',
          skin: 'simple',
          data: { mode: 'simple', goal: 'Coursework handed in', simple: { label: 'Handed in', percent: 33 } },
        },
      ],
    },
    {
      key: 'objectives',
      type: 'goal_tracker',
      title: 'Term objectives',
      skin: 'okr',
      data: {
        mode: 'okr',
        okr: {
          objective: 'Finish the term without a scramble',
          keyResults: [
            { id: rid('kr'), label: 'Average ≥ 80 on quizzes', current: 74, target: 80, weight: 2 },
            { id: rid('kr'), label: 'Past papers done', current: 6, target: 12, weight: 1 },
            { id: rid('kr'), label: 'Zero late submissions', current: 11, target: 12, weight: 1 },
          ],
        },
      },
    },
  ])

  school.column([
    {
      key: 'deck',
      type: 'flashcards',
      title: 'Series tests',
      skin: 'spaced_repetition',
      data: {
        mode: 'spaced_repetition',
        current: 0,
        cards: [
          { id: rid('card'), front: 'Ratio test — conclusive when?', back: 'L < 1 converges, L > 1 diverges, L = 1 tells you nothing' },
          { id: rid('card'), front: 'p-series converges when', back: 'p > 1' },
          { id: rid('card'), front: 'Alternating series test needs', back: 'Terms decreasing in size and tending to zero' },
          { id: rid('card'), front: 'Integral test requires', back: 'Positive, continuous, decreasing on [1, ∞)' },
          { id: rid('card'), front: 'Absolute vs conditional convergence', back: 'Absolute: Σ|aₙ| converges. Conditional: Σaₙ does, Σ|aₙ| does not' },
        ],
      },
    },
    {
      key: 'papers',
      type: 'past_papers',
      title: 'Past papers',
      skin: 'trend',
      data: atlas('past_papers', 'Past papers', {
        primary: 74,
        target: 85,
        text: 'Series convergence',
        history: series([58, 61, 66, 64, 71, 74]),
        items: [
          row('2024 Paper A', 58, { done: true, status: 'done' }),
          row('2024 Paper B', 66, { done: true, status: 'done' }),
          row('2023 Paper A', 71, { done: true, status: 'done' }),
          row('2023 Paper B', 74, { done: true, status: 'done' }),
          row('2022 Paper A', 0, { status: 'waiting' }),
          row('2022 Paper B', 0, { status: 'waiting' }),
        ],
      }),
    },
    {
      key: 'mistakes',
      type: 'mistake_bank',
      title: 'Mistake bank',
      skin: 'ledger',
      data: atlas('mistake_bank', 'Mistake bank', {
        primary: 14,
        text: 'Sign errors',
        items: [
          row('Dropped a minus expanding brackets', 5, { note: 'Algebra' }),
          row('Used ratio test where L = 1', 3, { note: 'Series' }),
          row('Forgot +C', 3, { note: 'Integration' }),
          row('Misread the interval', 3, { note: 'Reading' }),
        ],
      }),
    },
    {
      key: 'ladder',
      type: 'memorization_ladder',
      title: 'Memorization',
      skin: 'dial',
      data: atlas('memorization_ladder', 'Memorization', {
        primary: 12,
        target: 20,
        text: 'Convergence tests',
        items: [
          row('Ratio test', 4, { done: true, status: 'done' }),
          row('Root test', 4, { done: true, status: 'done' }),
          row('Integral test', 3, { status: 'active' }),
          row('Comparison tests', 2, { status: 'waiting' }),
        ],
      }),
    },
  ])

  school.column([
    {
      key: 'calendar',
      type: 'calendar',
      title: 'Term calendar',
      skin: 'month',
      data: {
        year: Number(today.slice(0, 4)),
        month: Number(today.slice(5, 7)) - 1,
        markedDates: [inDays(2), inDays(5), inDays(9), inDays(12), inDays(19)],
        skin: 'month',
      },
    },
    {
      key: 'skills',
      type: 'skill_tree',
      title: 'Skill tree',
      skin: 'object',
      data: atlas('skill_tree', 'Calculus skills', {
        primary: 7,
        target: 12,
        text: 'Power series',
        items: [
          row('Limits', 1, { done: true, status: 'done' }),
          row('Derivatives', 1, { done: true, status: 'done' }),
          row('Integration by parts', 1, { done: true, status: 'done' }),
          row('Sequences', 1, { done: true, status: 'done' }),
          row('Convergence tests', 1, { status: 'active' }),
          row('Power series', 0, { status: 'waiting' }),
          row('Taylor series', 0, { status: 'waiting' }),
        ],
      }),
    },
    {
      key: 'reading',
      type: 'reading_list',
      title: 'Reading',
      skin: 'curriculum',
      data: {
        title: 'Course reading',
        items: [
          { id: rid('read'), title: 'Stewart — Ch. 11 Sequences and Series', status: 'done' },
          { id: rid('read'), title: 'Strang — Linear Algebra Ch. 3', status: 'reading' },
          { id: rid('read'), title: 'OpenIntro Statistics Ch. 5', status: 'queued' },
          { id: rid('read'), title: 'Kuhn — Structure of Scientific Revolutions', status: 'queued' },
        ],
      },
    },
    {
      key: 'revision-habit',
      type: 'habit',
      title: 'Revision',
      skin: 'month_heatmap',
      data: {
        label: 'Revision block done',
        days: [true, true, false, true, true, true, false],
        streak: 9,
        skin: 'month_heatmap',
      },
    },
  ])

  school.column([
    { key: 'door-sprint', type: 'canvas_node', title: 'Exam Sprint', skin: 'live_thumbnail', accent: AMBER },
    { key: 'door-vault', type: 'canvas_node', title: 'Lecture Vault', skin: 'cover', accent: VIOLET },
    {
      key: 'sem-status',
      type: 'status',
      title: 'On track?',
      skin: 'traffic_light',
      data: { label: 'On track?', value: 'blocked' },
    },
    {
      key: 'sem-line',
      type: 'template',
      title: 'Where I stand',
      skin: 'sentence',
      data: { template: '{a} — weakest topic is {b}', slotA: 'Solid', slotB: 'Series convergence', slotC: '', slotD: '' },
      accent: VIOLET,
    },
    {
      key: 'sem-band',
      type: 'range_mapper',
      title: 'Grade band',
      skin: 'grade',
      data: {
        label: 'Grade band',
        input: 74,
        bands: [
          { id: rid('band'), upTo: 59, label: 'Failing', emoji: '🔴' },
          { id: rid('band'), upTo: 69, label: 'Passing', emoji: '🟠' },
          { id: rid('band'), upTo: 79, label: 'Solid', emoji: '🟡' },
          { id: rid('band'), upTo: Number.MAX_SAFE_INTEGER, label: 'Distinction', emoji: '🟢' },
        ],
      },
    },
  ])

  board.link(school, 'door-sprint', sprint)
  board.link(school, 'door-vault', vault)

  school.tree('term', ['assignments', 'grades', 'deck', 'calendar', 'door-sprint', 'door-vault'])
  school.tree('assignments', ['weekplan', 'hours'])
  school.tree('grades', ['quizscores', 'papers', 'term-progress'])
  school.tree('deck', ['ladder', 'skills'])
  school.rel('papers', 'mistakes', 'cousin')
  school.rel('assignments', 'objectives', 'blocker')

  school.wire({ from: 'assignments', fromPort: 'done_count', to: 'term-progress', toPort: 'percent', transform: { op: 'map_range', inMin: 0, inMax: 6, outMin: 0, outMax: 100 } })
  school.wire({ from: 'grades', fromPort: 'grade', to: 'sem-band', toPort: 'input' })
  school.wire({ from: 'sem-band', fromPort: 'label', to: 'sem-line', toPort: 'a' })
  school.wire({ from: 'papers', fromPort: 'weakest_topic', to: 'sem-line', toPort: 'b' })
  school.wire({ from: 'papers', fromPort: 'trend', to: 'quizscores', toPort: 'series' })

  // -- 3. Exam Sprint — the study circuit -----------------------------------

  sprint.column([
    {
      key: 'brief',
      type: 'notes',
      title: 'Sprint brief',
      skin: 'quote',
      data: {
        mode: 'quote',
        text: 'Nine days to the Calculus final. The board keeps score so I do not have to.',
        attribution: 'Sprint rules',
      },
      accent: AMBER,
    },
    {
      key: 'sessions',
      type: 'timekeeper',
      title: 'Sessions',
      skin: 'pomodoro',
      data: {
        mode: 'pomodoro',
        pomodoro: { label: 'Calculus', workMinutes: 25, breakMinutes: 5, phase: 'work', endAt: null, remainingSeconds: 1500, completed: 6 },
      },
    },
    {
      key: 'daily',
      type: 'clock_pulse',
      title: 'Every morning',
      skin: 'daily',
      data: { label: 'Reset the day', mode: 'daily', time: '07:00', days: [1, 2, 3, 4, 5, 6, 0], intervalMinutes: 60, windowStart: '07:00', windowEnd: '22:00', lastFiredAt: null },
      accent: ROSE,
    },
  ])

  sprint.column([
    {
      key: 'sprint-list',
      type: 'checklist',
      title: 'Today’s blocks',
      skin: 'sprint',
      data: {
        mode: 'sprint',
        items: [
          task('Ratio and root tests', { done: true }),
          task('Integral test worked examples', { done: true }),
          task('Timed past paper — 2022 A', { status: 'doing' }),
          task('Mark and log mistakes'),
          task('Rewrite the two failed proofs'),
        ],
      },
    },
    {
      key: 'sprint-papers',
      type: 'past_papers',
      title: 'Timed papers',
      skin: 'dial',
      data: atlas('past_papers', 'Timed papers', {
        primary: 74,
        target: 85,
        text: 'Series convergence',
        history: series([61, 66, 71, 74]),
        items: [row('2022 Paper A', 74, { done: true, status: 'done' }), row('2022 Paper B', 0, { status: 'waiting' })],
      }),
    },
    {
      key: 'effort',
      type: 'aggregator',
      title: 'Effort today',
      skin: 'sum',
      data: { label: 'Effort today', mode: 'sum', slots: [0, 0, 0, 0, 0, 0] },
      accent: AZURE,
    },
  ])

  sprint.column([
    {
      key: 'guard',
      type: 'comparator',
      title: 'Score guard',
      skin: 'threshold',
      data: { label: 'Below target?', op: 'lt', a: 74, b: 80, low: 0, high: 100 },
      accent: LIME,
    },
    {
      key: 'band',
      type: 'range_mapper',
      title: 'Readiness',
      skin: 'bands',
      data: {
        label: 'Readiness',
        input: 74,
        bands: [
          { id: rid('band'), upTo: 59, label: 'Not ready', emoji: '🔴' },
          { id: rid('band'), upTo: 74, label: 'Shaky', emoji: '🟠' },
          { id: rid('band'), upTo: 84, label: 'Nearly there', emoji: '🟡' },
          { id: rid('band'), upTo: Number.MAX_SAFE_INTEGER, label: 'Exam ready', emoji: '🟢' },
        ],
      },
    },
    {
      key: 'line',
      type: 'template',
      title: 'Message',
      skin: 'sentence',
      data: { template: 'Calculus: {a} at {b}% — {c} blocks done today', slotA: 'Nearly there', slotB: '74', slotC: '3', slotD: '' },
      accent: VIOLET,
    },
    {
      key: 'baseline',
      type: 'latch',
      title: 'Yesterday',
      skin: 'before_after',
      data: { label: 'Yesterday’s score', current: 74, held: 66, heldAt: inDays(-1) },
    },
  ])

  sprint.column([
    {
      key: 'readiness',
      type: 'goal_tracker',
      title: 'Exam readiness',
      skin: 'simple',
      data: { mode: 'simple', goal: 'Exam readiness', simple: { label: 'Readiness', percent: 74 } },
    },
    {
      key: 'sprint-status',
      type: 'status',
      title: 'Readiness',
      skin: 'badge',
      data: { label: 'Readiness', value: 'in_progress' },
    },
    {
      key: 'nudge',
      type: 'notifier',
      title: 'Nudge',
      skin: 'reminder',
      data: {
        label: 'Nudge',
        message: 'Score is under target — add one more timed paper.',
        channel: 'toast',
        cooldownMinutes: 240,
        armed: true,
        lastFiredAt: null,
        fireCount: 0,
        pendingFireAt: null,
      },
      accent: ROSE,
    },
    {
      key: 'sprint-metrics',
      type: 'metrics',
      title: 'Sprint',
      skin: 'big_number',
      data: {
        tiles: [
          { id: rid('tile'), label: 'Blocks today', value: '3', unit: '', trend: 'up' },
          { id: rid('tile'), label: 'Papers left', value: '1', unit: '', trend: 'down' },
        ],
      },
    },
  ])

  sprint.tree('brief', ['sprint-list', 'sprint-papers', 'readiness'])
  sprint.rel('sprint-papers', 'guard', 'blocker')

  sprint.wire({ from: 'sessions', fromPort: 'sessions_done', to: 'effort', toPort: 'in1' })
  sprint.wire({ from: 'sprint-list', fromPort: 'done_count', to: 'effort', toPort: 'in2' })
  sprint.wire({ from: 'sprint-papers', fromPort: 'avg_score', to: 'guard', toPort: 'a' })
  sprint.wire({ from: 'sprint-papers', fromPort: 'avg_score', to: 'band', toPort: 'input' })
  sprint.wire({ from: 'sprint-papers', fromPort: 'avg_score', to: 'baseline', toPort: 'current' })
  sprint.wire({ from: 'sprint-papers', fromPort: 'avg_score', to: 'readiness', toPort: 'percent', transform: { op: 'clamp', min: 0, max: 100 } })
  sprint.wire({ from: 'band', fromPort: 'label', to: 'line', toPort: 'a' })
  sprint.wire({ from: 'effort', fromPort: 'value', to: 'sprint-metrics', toPort: 'value_1' })
  sprint.wire({ from: 'guard', fromPort: 'result', to: 'nudge', toPort: 'armed' })
  sprint.wire({ from: 'line', fromPort: 'text', to: 'nudge', toPort: 'message' })
  sprint.trigger({ from: 'daily', fromPort: 'pulse', to: 'sprint-list', command: 'uncheck_all' })
  sprint.trigger({ from: 'daily', fromPort: 'pulse', to: 'baseline', command: 'capture' })
  sprint.trigger({ from: 'guard', fromPort: 'result', to: 'nudge', command: 'notify' })

  // -- 4. Lecture Vault -----------------------------------------------------

  vault.column([
    {
      key: 'vault-outline',
      type: 'outline',
      title: 'Course map',
      skin: 'course',
      data: {
        skin: 'course',
        items: [
          { id: rid('out'), text: 'Calculus II', depth: 0, collapsed: false },
          { id: rid('out'), text: 'Sequences', depth: 1, collapsed: false },
          { id: rid('out'), text: 'Series and convergence', depth: 1, collapsed: false },
          { id: rid('out'), text: 'Ratio, root, integral tests', depth: 2, collapsed: false },
          { id: rid('out'), text: 'Power series', depth: 1, collapsed: false },
          { id: rid('out'), text: 'Taylor and Maclaurin', depth: 2, collapsed: false },
        ],
      },
      accent: VIOLET,
    },
    {
      key: 'cornell-1',
      type: 'cornell',
      title: 'Lecture 14',
      skin: 'lecture',
      data: {
        cues: 'Why does p > 1 matter?\nWhen is the ratio test useless?',
        notes: 'p-series Σ 1/nᵖ converges exactly when p > 1. The integral test is the cleanest proof.\n\nRatio test returns L = 1 for every p-series, so it can never settle them.',
        summary: 'Pick the test by the shape of the term, not by habit.',
      },
    },
    {
      key: 'cornell-2',
      type: 'cornell',
      title: 'Reading — Kuhn',
      skin: 'reading',
      data: {
        cues: 'What counts as a paradigm?\nIs normal science conservative?',
        notes: 'Normal science solves puzzles inside a paradigm. Anomalies accumulate until a crisis makes a new frame thinkable.',
        summary: 'Progress is not only accumulation; frames get replaced.',
      },
    },
  ])

  vault.column([
    {
      key: 'formulas',
      type: 'formula_sheet',
      title: 'Formula sheet',
      skin: 'reference_sheet',
      data: {
        formulas: [
          { id: rid('f'), name: 'Ratio test', expression: 'L = lim |a₍ₙ₊₁₎ / aₙ|' },
          { id: rid('f'), name: 'Root test', expression: 'L = lim ⁿ√|aₙ|' },
          { id: rid('f'), name: 'Geometric series', expression: 'Σ arⁿ = a / (1 − r), |r| < 1' },
          { id: rid('f'), name: 'Taylor series', expression: 'f(x) = Σ f⁽ⁿ⁾(a)(x − a)ⁿ / n!' },
          { id: rid('f'), name: 'Integration by parts', expression: '∫u dv = uv − ∫v du' },
        ],
      },
    },
    {
      key: 'sources',
      type: 'citation',
      title: 'Sources',
      skin: 'bibliography',
      data: {
        style: 'APA',
        sources: [
          { id: rid('s'), title: 'Calculus: Early Transcendentals', author: 'Stewart, J.', year: '2020' },
          { id: rid('s'), title: 'Introduction to Linear Algebra', author: 'Strang, G.', year: '2016' },
          { id: rid('s'), title: 'The Structure of Scientific Revolutions', author: 'Kuhn, T.', year: '1962' },
        ],
      },
    },
    {
      key: 'vault-links',
      type: 'links',
      title: 'Resources',
      skin: 'research_trail',
      data: {
        items: [
          { id: rid('l'), label: 'MIT 18.01 lecture notes', url: 'https://ocw.mit.edu' },
          { id: rid('l'), label: 'Paul’s Online Math Notes', url: 'https://tutorial.math.lamar.edu' },
          { id: rid('l'), label: 'Course portal', url: 'https://example.edu/calc2' },
        ],
      },
    },
  ])

  vault.column([
    {
      key: 'sketch',
      type: 'sketchpad',
      title: 'Convergence map',
      skin: 'graph_paper',
      data: { mode: 'graph_paper', height: 300, strokes: [], skinStates: {} },
    },
    {
      key: 'cloze',
      type: 'flashcards',
      title: 'Definitions',
      skin: 'cloze',
      data: {
        mode: 'cloze',
        current: 0,
        cards: [
          { id: rid('c'), front: 'A series converges absolutely when ___ converges.', back: 'Σ|aₙ|' },
          { id: rid('c'), front: 'The radius of convergence comes from the ___ test.', back: 'ratio' },
          { id: rid('c'), front: 'A p-series converges when p ___ 1.', back: '>' },
        ],
      },
    },
    {
      key: 'log',
      type: 'logbook',
      title: 'Study log',
      skin: 'lab_notebook',
      data: {
        skin: 'lab_notebook',
        entries: [
          { id: rid('e'), timestamp: `${inDays(-2)}T18:20:00.000Z`, text: 'Reworked the integral test proof. Finally clicked.', level: 'note' },
          { id: rid('e'), timestamp: `${inDays(-1)}T09:05:00.000Z`, text: 'Timed paper 2023B — 74. Lost marks on interval notation.', level: 'warning' },
          { id: rid('e'), timestamp: `${today}T08:40:00.000Z`, text: 'Two blocks before lecture. Cards felt easy.', level: 'note' },
        ],
      },
    },
  ])

  vault.tree('vault-outline', ['cornell-1', 'cornell-2', 'formulas', 'sketch', 'cloze'])
  vault.rel('sources', 'cornell-2', 'cousin')
  vault.wire({ from: 'cornell-1', fromPort: 'summary', to: 'log', toPort: 'append' })

  // -- 5. Money Center ------------------------------------------------------

  money.column([
    {
      key: 'money-note',
      type: 'notes',
      title: 'The rule',
      skin: 'callout',
      data: {
        mode: 'callout',
        text: 'Pay the future first. Everything left is genuinely spendable.\n\nReview every Sunday. Move the surplus before Monday.',
      },
      accent: LIME,
    },
    {
      glue: 'Monthly money',
      cards: [
        {
          key: 'budget',
          type: 'budget',
          title: 'Monthly budget',
          skin: '50_30_20',
          data: {
            currency: '$',
            skin: '50_30_20',
            items: [
              { id: rid('b'), label: 'Rent', amount: 1180 },
              { id: rid('b'), label: 'Groceries', amount: 340 },
              { id: rid('b'), label: 'Transport', amount: 96 },
              { id: rid('b'), label: 'Utilities', amount: 128 },
              { id: rid('b'), label: 'Phone + internet', amount: 74 },
              { id: rid('b'), label: 'Going out', amount: 180 },
              { id: rid('b'), label: 'Savings transfer', amount: 400 },
              { id: rid('b'), label: 'Debt overpayment', amount: 250 },
            ],
          },
        },
        {
          key: 'subs',
          type: 'subscriptions',
          title: 'Subscriptions',
          skin: 'cost_breakdown',
          data: {
            rows: [
              { id: rid('sub'), name: 'Streaming', cost: 15.99, cycle: 'monthly', renewsOn: inDays(4), active: true },
              { id: rid('sub'), name: 'Music', cost: 10.99, cycle: 'monthly', renewsOn: inDays(11), active: true },
              { id: rid('sub'), name: 'Cloud storage', cost: 2.99, cycle: 'monthly', renewsOn: inDays(17), active: true },
              { id: rid('sub'), name: 'Gym', cost: 32, cycle: 'monthly', renewsOn: inDays(2), active: true },
              { id: rid('sub'), name: 'Design tool', cost: 144, cycle: 'yearly', renewsOn: inDays(58), active: true },
              { id: rid('sub'), name: 'News', cost: 6, cycle: 'monthly', renewsOn: inDays(23), active: false },
            ],
          },
          badges: [{ type: 'status_dot', color: 'yellow' }],
        },
      ],
    },
    {
      key: 'ledger',
      type: 'table',
      title: 'This month',
      skin: 'compact_ledger',
      data: {
        rows: [
          ['Date', 'What', 'Amount'],
          [inDays(-1), 'Groceries', '-84.20'],
          [inDays(-3), 'Bus pass', '-48.00'],
          [inDays(-4), 'Tutoring paid', '+180.00'],
          [inDays(-6), 'Rent', '-1180.00'],
          [inDays(-9), 'Freelance invoice', '+640.00'],
        ],
      },
    },
  ])

  money.column([
    {
      glue: 'Debt plan',
      cards: [
        {
          key: 'extra',
          type: 'number_input',
          title: 'Extra payment',
          skin: 'currency',
          data: { label: 'Extra each month', value: 250, min: 0, max: 800, step: 25 },
          accent: LIME,
        },
        {
          key: 'debt',
          type: 'debt_payoff',
          title: 'Debt payoff',
          skin: 'avalanche',
          data: {
            skin: 'avalanche',
            currency: '$',
            extraPayment: 250,
            debts: [
              { id: rid('d'), name: 'Credit card', balance: 2480, rate: 22.9, minimum: 74 },
              { id: rid('d'), name: 'Student loan', balance: 8600, rate: 5.4, minimum: 96 },
              { id: rid('d'), name: 'Phone finance', balance: 340, rate: 0, minimum: 28 },
            ],
          },
        },
        {
          key: 'freedom',
          type: 'goal_tracker',
          title: 'Debt free',
          skin: 'milestones',
          data: {
            mode: 'milestones',
            goal: 'Debt free',
            milestones: [
              { id: rid('ms'), label: 'Phone finance cleared', done: true },
              { id: rid('ms'), label: 'Credit card under $2,000', done: true },
              { id: rid('ms'), label: 'Credit card cleared', done: false },
              { id: rid('ms'), label: 'Student loan cleared', done: false },
            ],
          },
        },
      ],
    },
    {
      key: 'savings',
      type: 'goal_tracker',
      title: 'Emergency fund',
      skin: 'simple',
      data: { mode: 'simple', goal: 'Three months of costs', simple: { label: 'Saved', percent: 62 } },
    },
    {
      key: 'circle',
      type: 'savings_circle',
      title: 'Savings circle',
      skin: 'dial',
      data: atlas('savings_circle', 'Savings circle', {
        primary: 100,
        target: 8,
        text: 'Round 3 of 8',
        items: [
          row('Amina', 100, { done: true, status: 'done' }),
          row('You', 100, { status: 'active' }),
          row('Tomas', 100, { status: 'waiting' }),
          row('Priya', 100, { status: 'waiting' }),
        ],
      }),
    },
  ])

  money.column([
    {
      key: 'spend-chart',
      type: 'bar_chart',
      title: 'Spend by month',
      skin: 'area',
      data: {
        title: 'Spend by month',
        mode: 'area',
        unit: '$',
        bars: bars(
          [['Mar', 2380], ['Apr', 2510], ['May', 2295], ['Jun', 2440], ['Jul', 2248]],
          [LIME],
        ),
      },
    },
    {
      key: 'categories',
      type: 'bar_chart',
      title: 'Where it goes',
      skin: 'donut',
      data: {
        title: 'Where it goes',
        mode: 'donut',
        unit: '$',
        bars: bars(
          [['Rent', 1180], ['Food', 340], ['Transport', 96], ['Life', 254], ['Future', 650]],
          [AZURE, LIME, AMBER, ROSE, VIOLET],
        ),
      },
    },
    {
      key: 'money-metrics',
      type: 'metrics',
      title: 'Money at a glance',
      skin: 'executive_strip',
      data: {
        tiles: [
          { id: rid('t'), label: 'Subscriptions', value: '62', unit: '$', trend: 'flat' },
          { id: rid('t'), label: 'In', value: '3140', unit: '$', trend: 'up' },
          { id: rid('t'), label: 'Out', value: '2248', unit: '$', trend: 'down' },
          { id: rid('t'), label: 'Runway', value: '4.2', unit: 'mo', trend: 'up' },
        ],
      },
    },
    {
      key: 'rate',
      type: 'formula',
      title: 'Savings rate',
      skin: 'percent_change',
      data: { label: 'Savings rate', a: 650, b: 3140, operator: 'divide' },
      accent: AZURE,
    },
  ])

  money.column([
    {
      key: 'split',
      type: 'expense_split',
      title: 'Flat share',
      skin: 'household',
      data: {
        skin: 'household',
        currency: '$',
        people: ['You', 'Tomas', 'Amina'],
        expenses: [
          { id: rid('x'), label: 'Rent', amount: 1770, paidBy: 0 },
          { id: rid('x'), label: 'Internet', amount: 54, paidBy: 1 },
          { id: rid('x'), label: 'Groceries run', amount: 128, paidBy: 2 },
        ],
      },
    },
    {
      key: 'wishlist',
      type: 'wishlist_saver',
      title: 'Wishlist',
      skin: 'dial',
      data: atlas('wishlist_saver', 'Wishlist', {
        primary: 120,
        target: 640,
        text: 'Second monitor',
        items: [row('Second monitor', 240, { status: 'active' }), row('Winter coat', 180, { status: 'waiting' }), row('Bike service', 90, { status: 'waiting' })],
      }),
    },
    {
      key: 'zakat',
      type: 'zakat',
      title: 'Giving',
      skin: 'dial',
      data: atlas('zakat', 'Giving', { primary: 9200, secondary: 2.5, target: 5100, text: 'Annual' }),
    },
    {
      key: 'renewals',
      type: 'renewals_vault',
      title: 'Renewals',
      skin: 'wallet',
      data: {
        rows: [
          { id: rid('r'), item: 'Passport', expires: inDays(180), noteRef: '', renewLeadDays: 90 },
          { id: rid('r'), item: 'Tenancy agreement', expires: inDays(64), noteRef: '', renewLeadDays: 60 },
          { id: rid('r'), item: 'Travel insurance', expires: inDays(27), noteRef: '', renewLeadDays: 30 },
          { id: rid('r'), item: 'Student railcard', expires: inDays(9), noteRef: '', renewLeadDays: 14 },
        ],
      },
      badges: [{ type: 'status_dot', color: 'red' }],
    },
  ])

  money.column([
    {
      key: 'rent-due',
      type: 'timekeeper',
      title: 'Rent due',
      skin: 'deadline',
      data: { mode: 'deadline', deadline: { label: 'Rent leaves the account', targetDate: inDays(6) } },
    },
    {
      key: 'sub-guard',
      type: 'comparator',
      title: 'Renewals soon?',
      skin: 'threshold',
      data: { label: 'Renewals soon?', op: 'gte', a: 2, b: 1, low: 0, high: 10 },
    },
    {
      key: 'money-band',
      type: 'range_mapper',
      title: 'Debt outlook',
      skin: 'priority',
      data: {
        label: 'Debt outlook',
        input: 26,
        bands: [
          { id: rid('bd'), upTo: 12, label: 'Cleared within a year', emoji: '🟢' },
          { id: rid('bd'), upTo: 24, label: 'Two-year plan', emoji: '🟡' },
          { id: rid('bd'), upTo: 48, label: 'Long haul', emoji: '🟠' },
          { id: rid('bd'), upTo: Number.MAX_SAFE_INTEGER, label: 'Needs a rethink', emoji: '🔴' },
        ],
      },
    },
    {
      key: 'money-line',
      type: 'template',
      title: 'Money line',
      skin: 'sentence',
      data: { template: '{a} — debt free by {b}', slotA: 'Long haul', slotB: 'Nov 2028', slotC: '', slotD: '' },
      accent: VIOLET,
    },
    {
      key: 'money-alert',
      type: 'notifier',
      title: 'Money alert',
      skin: 'banner',
      data: {
        label: 'Money alert',
        message: 'A subscription renews in the next few days.',
        channel: 'toast',
        cooldownMinutes: 720,
        armed: true,
        lastFiredAt: null,
        fireCount: 0,
        pendingFireAt: null,
      },
      accent: ROSE,
    },
    { key: 'door-freelance', type: 'canvas_node', title: 'Freelance Studio', skin: 'live_thumbnail', accent: AMBER },
  ])

  board.link(money, 'door-freelance', freelance)

  money.tree('money-note', ['budget', 'debt', 'savings', 'money-metrics', 'door-freelance'])
  money.tree('budget', ['subs', 'ledger', 'categories'])
  money.tree('debt', ['extra', 'freedom'])
  money.rel('subs', 'sub-guard', 'blocker')
  money.rel('renewals', 'rent-due', 'cousin')

  money.wire({ from: 'extra', fromPort: 'value', to: 'debt', toPort: 'extraPayment' })
  money.wire({ from: 'budget', fromPort: 'total', to: 'rate', toPort: 'b' })
  money.wire({ from: 'subs', fromPort: 'monthlyTotal', to: 'money-metrics', toPort: 'value_1' })
  money.wire({ from: 'subs', fromPort: 'dueSoonCount', to: 'sub-guard', toPort: 'a' })
  money.wire({ from: 'sub-guard', fromPort: 'result', to: 'money-alert', toPort: 'armed' })
  money.wire({ from: 'rate', fromPort: 'result', to: 'savings', toPort: 'percent', transform: { op: 'scale', factor: 100 } })
  money.wire({ from: 'debt', fromPort: 'monthsToFree', to: 'money-band', toPort: 'input' })
  money.wire({ from: 'money-band', fromPort: 'label', to: 'money-line', toPort: 'a' })
  money.wire({ from: 'debt', fromPort: 'debtFreeDate', to: 'money-line', toPort: 'b' })
  money.wire({ from: 'money-line', fromPort: 'text', to: 'money-alert', toPort: 'message' })
  money.trigger({ from: 'sub-guard', fromPort: 'result', to: 'money-alert', command: 'notify' })

  // -- 6. Freelance Studio --------------------------------------------------

  freelance.column([
    {
      key: 'clients',
      type: 'table',
      title: 'Clients',
      skin: 'grid',
      data: {
        rows: [
          ['Client', 'Rate', 'Status'],
          ['Northwind', '$62/h', 'Active'],
          ['Ardent Books', '$55/h', 'Active'],
          ['Fold Studio', '$70/h', 'Paused'],
        ],
      },
    },
    {
      key: 'invoices',
      type: 'invoices',
      title: 'Invoices',
      skin: 'aging',
      data: {
        currency: '$',
        rows: [
          { id: rid('inv'), client: 'Northwind', number: 'INV-041', amount: 1240, issued: inDays(-34), due: inDays(-4), paid: false },
          { id: rid('inv'), client: 'Ardent Books', number: 'INV-042', amount: 660, issued: inDays(-18), due: inDays(12), paid: false },
          { id: rid('inv'), client: 'Northwind', number: 'INV-040', amount: 980, issued: inDays(-60), due: inDays(-30), paid: true },
        ],
      },
      badges: [{ type: 'status_dot', color: 'red' }],
    },
    {
      key: 'hours-log',
      type: 'timesheet',
      title: 'Hours',
      skin: 'client',
      data: {
        currency: '$',
        hourlyRate: 62,
        entries: [
          { id: rid('h'), date: inDays(-4), label: 'Northwind — onboarding flow', hours: 5.5, billable: true },
          { id: rid('h'), date: inDays(-3), label: 'Ardent — cover revisions', hours: 3, billable: true },
          { id: rid('h'), date: inDays(-2), label: 'Northwind — QA pass', hours: 4, billable: true },
          { id: rid('h'), date: inDays(-1), label: 'Admin and invoicing', hours: 1.5, billable: false },
        ],
      },
    },
  ])

  freelance.column([
    {
      key: 'pipeline',
      type: 'content_pipeline',
      title: 'Pipeline',
      skin: 'ledger',
      data: atlas('content_pipeline', 'Pipeline', {
        primary: 4,
        target: 6,
        text: 'Northwind case study',
        items: [
          row('Northwind case study', 1, { status: 'active' }),
          row('Ardent cover set', 1, { status: 'active' }),
          row('Portfolio refresh', 0, { status: 'waiting' }),
          row('Newsletter #12', 0, { status: 'waiting' }),
        ],
      }),
    },
    {
      key: 'estimate',
      type: 'estimate_builder',
      title: 'Quote',
      skin: 'ledger',
      data: atlas('estimate_builder', 'Fold Studio — rebrand', {
        primary: 4200,
        secondary: 1.15,
        target: 3800,
        text: 'Two rounds included',
        items: [row('Discovery', 600), row('Design', 2400), row('Handover', 800), row('Contingency', 400)],
      }),
    },
    {
      key: 'scope',
      type: 'scope_meter',
      title: 'Scope',
      skin: 'object',
      data: atlas('scope_meter', 'Northwind revisions', {
        primary: 2,
        target: 3,
        text: 'Two of three used',
        items: [row('Round 1', 1, { done: true, status: 'done' }), row('Round 2', 1, { done: true, status: 'done' }), row('Round 3', 0, { status: 'waiting' })],
      }),
    },
  ])

  freelance.column([
    {
      key: 'waiting',
      type: 'waiting_on',
      title: 'Waiting on',
      skin: 'ledger',
      data: atlas('waiting_on', 'Waiting on', {
        primary: 3,
        text: 'Northwind — signed SOW',
        items: [
          row('Northwind — signed SOW', 9, { status: 'active' }),
          row('Ardent — final copy', 4, { status: 'active' }),
          row('Accountant — Q2 numbers', 2, { status: 'waiting' }),
        ],
      }),
    },
    {
      key: 'income',
      type: 'side_income',
      title: 'Income streams',
      skin: 'dial',
      data: atlas('side_income', 'Income streams', {
        primary: 1900,
        target: 2600,
        text: 'Next payout Friday',
        items: [row('Client work', 1600), row('Tutoring', 240), row('Template sales', 60)],
      }),
    },
    {
      key: 'meeting-cost',
      type: 'meeting_cost',
      title: 'Meeting cost',
      skin: 'object',
      data: atlas('meeting_cost', 'Meeting cost', { primary: 4, secondary: 62, target: 300 }),
    },
    {
      key: 'freelance-status',
      type: 'status',
      title: 'Cashflow',
      skin: 'traffic_light',
      data: { label: 'Cashflow', value: 'blocked' },
    },
  ])

  freelance.column([
    {
      key: 'chase',
      type: 'comparator',
      title: 'Anything overdue?',
      skin: 'threshold',
      data: { label: 'Anything overdue?', op: 'gte', a: 1, b: 1, low: 0, high: 10 },
    },
    {
      key: 'chase-text',
      type: 'template',
      title: 'Chase note',
      skin: 'email',
      data: { template: 'Hi {a} — just checking in on invoice {b}, now {c} days past due.', slotA: 'Northwind', slotB: 'INV-041', slotC: '4', slotD: '' },
    },
    {
      key: 'chase-alert',
      type: 'notifier',
      title: 'Chase reminder',
      skin: 'escalation',
      data: {
        label: 'Chase reminder',
        message: 'An invoice is past due.',
        channel: 'toast',
        cooldownMinutes: 1440,
        armed: true,
        lastFiredAt: null,
        fireCount: 0,
        pendingFireAt: null,
      },
      accent: ROSE,
    },
    {
      key: 'freelance-metrics',
      type: 'metrics',
      title: 'Studio',
      skin: 'scoreboard',
      data: {
        tiles: [
          { id: rid('t'), label: 'Outstanding', value: '1900', unit: '$', trend: 'flat' },
          { id: rid('t'), label: 'Billable h', value: '12.5', unit: '', trend: 'up' },
          { id: rid('t'), label: 'Overdue', value: '1', unit: '', trend: 'down' },
        ],
      },
    },
  ])

  freelance.tree('clients', ['invoices', 'hours-log', 'pipeline', 'estimate'])
  freelance.tree('invoices', ['chase', 'freelance-metrics'])
  freelance.rel('scope', 'estimate', 'blocker')
  freelance.rel('waiting', 'pipeline', 'conflict')

  freelance.wire({ from: 'invoices', fromPort: 'overdueCount', to: 'chase', toPort: 'a' })
  freelance.wire({ from: 'invoices', fromPort: 'outstanding', to: 'freelance-metrics', toPort: 'value_1' })
  freelance.wire({ from: 'chase', fromPort: 'result', to: 'chase-alert', toPort: 'armed' })
  freelance.wire({ from: 'chase-text', fromPort: 'text', to: 'chase-alert', toPort: 'message' })
  freelance.wire({ from: 'hours-log', fromPort: 'amount', to: 'income', toPort: 'pending_amount' })
  freelance.trigger({ from: 'chase', fromPort: 'result', to: 'chase-alert', command: 'notify' })

  // -- 7. Life Systems ------------------------------------------------------

  life.column([
    {
      key: 'life-note',
      type: 'notes',
      title: 'House rules',
      skin: 'sticky',
      data: { mode: 'sticky', color: 'green', text: 'Bins out Tuesday.\nWater the plants Sunday.\nNobody cooks two nights running.' },
      accent: ROSE,
    },
    {
      glue: 'Morning',
      cards: [
        {
          key: 'water',
          type: 'hydration',
          title: 'Water',
          skin: 'dial',
          data: atlas('hydration', 'Water', { primary: 1400, target: 2200 }),
        },
        {
          key: 'meds',
          type: 'medications',
          title: 'Medication',
          skin: 'today',
          data: {
            rows: [
              { id: rid('m'), name: 'Vitamin D', timesPerDay: 1, takenToday: [true], pillsLeft: 42, dailyUse: 1 },
              { id: rid('m'), name: 'Iron', timesPerDay: 2, takenToday: [true, false], pillsLeft: 18, dailyUse: 2 },
            ],
          },
        },
        {
          key: 'stretch-habit',
          type: 'habit',
          title: 'Morning routine',
          skin: 'routine_stack',
          data: { label: 'Morning routine', days: [true, true, true, false, true, true, true], streak: 6, skin: 'routine_stack' },
        },
      ],
    },
    {
      key: 'mood',
      type: 'mood_tracker',
      title: 'Mood',
      skin: 'month_heatmap',
      data: { days: [4, 3, 5, 2, 4, 5, 4] },
    },
  ])

  life.column([
    {
      key: 'sleep',
      type: 'sleep_ledger',
      title: 'Sleep',
      skin: 'trend',
      data: atlas('sleep_ledger', 'Sleep', {
        primary: 6.4,
        target: 8,
        history: series([7.1, 6.2, 5.8, 6.9, 7.4, 6.4]),
      }),
    },
    {
      key: 'vitals',
      type: 'vitals_log',
      title: 'Vitals',
      skin: 'trend',
      data: atlas('vitals_log', 'Vitals', {
        primary: 118,
        secondary: 76,
        target: 130,
        history: series([124, 121, 119, 122, 118]),
      }),
    },
    {
      key: 'workout',
      type: 'workout_plan',
      title: 'Training',
      skin: 'strength',
      data: {
        skin: 'strength',
        activeDay: 0,
        lastSession: inDays(-2),
        days: [
          {
            id: rid('day'),
            label: 'Lower body',
            exercises: [
              { id: rid('e'), name: 'Back squat', sets: 4, reps: 6, weight: 72.5, done: true },
              { id: rid('e'), name: 'Romanian deadlift', sets: 3, reps: 8, weight: 60, done: true },
              { id: rid('e'), name: 'Split squat', sets: 3, reps: 10, weight: 20, done: false },
              { id: rid('e'), name: 'Calf raise', sets: 3, reps: 15, weight: 40, done: false },
            ],
          },
          {
            id: rid('day'),
            label: 'Upper body',
            exercises: [
              { id: rid('e'), name: 'Bench press', sets: 4, reps: 6, weight: 55, done: false },
              { id: rid('e'), name: 'Row', sets: 4, reps: 8, weight: 50, done: false },
              { id: rid('e'), name: 'Pull-up', sets: 3, reps: 6, weight: 0, done: false },
            ],
          },
        ],
      },
    },
  ])

  life.column([
    {
      key: 'meals',
      type: 'meal_planner',
      title: 'Meals',
      skin: 'week',
      data: {
        skin: 'week',
        shoppingList: 'Oats, eggs, spinach, chicken, rice, lentils, tinned tomatoes, yoghurt',
        week: [0, 1, 2, 3, 4, 5, 6].flatMap((day) => {
          const dishes: Record<number, [string, string, string]> = {
            0: ['Oats and berries', 'Leftover chilli', 'Roast chicken'],
            1: ['Yoghurt and fruit', 'Chicken wrap', 'Lentil dahl'],
            2: ['Eggs on toast', 'Dahl and rice', 'Pasta and greens'],
            3: ['Oats', 'Soup and bread', 'Stir fry'],
            4: ['Smoothie', 'Rice bowl', 'Fish and potatoes'],
            5: ['Pancakes', 'Toastie', 'Pizza night'],
            6: ['Big breakfast', 'Leftovers', 'Chilli — batch cook'],
          }
          return (['breakfast', 'lunch', 'dinner'] as const).map((meal, index) => ({
            id: rid('meal'),
            day,
            meal,
            dish: dishes[day]![index]!,
          }))
        }),
      },
    },
    {
      key: 'recipe',
      type: 'recipe',
      title: 'Batch chilli',
      skin: 'scale',
      data: {
        title: 'Batch chilli',
        servings: 6,
        baseServings: 2,
        cookMinutes: 50,
        ingredients: [
          { id: rid('i'), qty: 400, unit: 'g', item: 'Minced beef' },
          { id: rid('i'), qty: 2, unit: 'tin', item: 'Chopped tomatoes' },
          { id: rid('i'), qty: 1, unit: 'tin', item: 'Kidney beans' },
          { id: rid('i'), qty: 1, unit: '', item: 'Onion' },
          { id: rid('i'), qty: 2, unit: 'tsp', item: 'Smoked paprika' },
        ],
        steps: [
          { id: rid('s'), text: 'Brown the mince, set aside', done: false },
          { id: rid('s'), text: 'Soften onion and spices', done: false },
          { id: rid('s'), text: 'Add tomatoes and beans, simmer 30 min', done: false },
        ],
      },
    },
    {
      key: 'pantry',
      type: 'inventory',
      title: 'Pantry',
      skin: 'pantry',
      data: {
        items: [
          { id: rid('p'), name: 'Rice', quantity: 2, minimum: 1, unit: 'kg' },
          { id: rid('p'), name: 'Lentils', quantity: 0, minimum: 1, unit: 'kg' },
          { id: rid('p'), name: 'Tinned tomatoes', quantity: 6, minimum: 4, unit: 'tin' },
          { id: rid('p'), name: 'Olive oil', quantity: 1, minimum: 1, unit: 'l' },
          { id: rid('p'), name: 'Coffee', quantity: 0, minimum: 1, unit: 'bag' },
        ],
      },
      badges: [{ type: 'status_dot', color: 'yellow' }],
    },
  ])

  life.column([
    {
      key: 'chores',
      type: 'chore_rotation',
      title: 'Chores',
      skin: 'fairness',
      data: {
        skin: 'fairness',
        people: ['You', 'Tomas', 'Amina'],
        chores: ['Kitchen', 'Bathroom', 'Bins', 'Hoovering'],
        offset: 1,
        cadenceLabel: 'Weekly',
      },
    },
    {
      key: 'plants',
      type: 'plant_care',
      title: 'Plants',
      skin: 'ledger',
      data: atlas('plant_care', 'Plants', {
        primary: 4,
        target: 7,
        text: 'Fiddle leaf fig',
        items: [
          row('Fiddle leaf fig', 7, { status: 'active' }),
          row('Monstera', 10, { status: 'waiting' }),
          row('Snake plant', 21, { status: 'waiting' }),
          row('Basil', 2, { status: 'active' }),
        ],
      }),
    },
    {
      key: 'bins',
      type: 'bin_night',
      title: 'Bin night',
      skin: 'object',
      data: atlas('bin_night', 'Bin night', { text: 'Green bin', primary: 1, target: 2 }),
    },
    {
      key: 'maintenance',
      type: 'home_maintenance',
      title: 'Home upkeep',
      skin: 'due_soon',
      data: {
        rows: [
          { id: rid('mt'), task: 'Boiler service', everyMonths: 12, lastDone: inDays(-340) },
          { id: rid('mt'), task: 'Replace filter', everyMonths: 3, lastDone: inDays(-96) },
          { id: rid('mt'), task: 'Descale kettle', everyMonths: 2, lastDone: inDays(-20) },
          { id: rid('mt'), task: 'Smoke alarm test', everyMonths: 6, lastDone: inDays(-150) },
        ],
      },
    },
  ])

  life.column([
    {
      key: 'packing',
      type: 'packing_matrix',
      title: 'Packing',
      skin: 'dial',
      data: atlas('packing_matrix', 'Packing', {
        primary: 12,
        target: 20,
        items: [row('Charger', 1, { done: true, status: 'done' }), row('Boots', 1, { done: true, status: 'done' }), row('Book', 1, { status: 'waiting' })],
      }),
    },
    {
      key: 'touch',
      type: 'keep_in_touch',
      title: 'Keep in touch',
      skin: 'queue',
      data: {
        rows: [
          { id: rid('k'), name: 'Nadia', cadenceDays: 14, lastContact: inDays(-19), note: 'New job — ask how it is going' },
          { id: rid('k'), name: 'Dad', cadenceDays: 7, lastContact: inDays(-5), note: '' },
          { id: rid('k'), name: 'Sam', cadenceDays: 30, lastContact: inDays(-41), note: 'Owes me a climbing session' },
        ],
      },
    },
    {
      key: 'review',
      type: 'weekly_review',
      title: 'Weekly review',
      skin: 'guided',
      data: {
        prompts: [
          { id: rid('q'), q: 'What went well?', answer: 'Kept every study block. Cooked five nights.' },
          { id: rid('q'), q: 'What should change?', answer: 'Sleep. Two nights under six hours.' },
          { id: rid('q'), q: 'What carries forward?', answer: 'Timed paper on Thursday.' },
        ],
        weekOf: today,
        historyCount: 14,
        streak: 6,
        completedThisWeek: true,
      },
    },
    {
      key: 'trip',
      type: 'trip_itinerary',
      title: 'Reading weekend',
      skin: 'days',
      data: {
        tripName: 'Reading weekend',
        startDate: inDays(24),
        days: [
          {
            id: rid('td'),
            date: inDays(24),
            legs: [
              { id: rid('lg'), time: '08:40', what: 'Train north', where: 'Platform 4', confirmation: 'RX-8821', booked: true },
              { id: rid('lg'), time: '12:00', what: 'Check in', where: 'Harbour Rooms', confirmation: 'HB-2201', booked: true },
              { id: rid('lg'), time: '19:30', what: 'Dinner', where: 'The Anchor', confirmation: '', booked: false },
            ],
          },
          {
            id: rid('td'),
            date: inDays(25),
            legs: [
              { id: rid('lg'), time: '10:00', what: 'Coast walk', where: 'Cliff path', confirmation: '', booked: false },
              { id: rid('lg'), time: '17:10', what: 'Train home', where: 'Platform 1', confirmation: 'RX-8822', booked: true },
            ],
          },
        ],
      },
    },
  ])

  life.column([
    {
      key: 'gratitude',
      type: 'gratitude_jar',
      title: 'Gratitude',
      skin: 'object',
      data: atlas('gratitude_jar', 'Gratitude', {
        primary: 41,
        text: 'One line a night',
        items: [row('Long walk, no phone', 1), row('Tomas cooked', 1), row('Finally understood the integral test', 1)],
      }),
    },
    {
      key: 'life-goal',
      type: 'goal_tracker',
      title: 'Hydration goal',
      skin: 'simple',
      data: { mode: 'simple', goal: 'Drink the daily target', simple: { label: 'Today', percent: 64 } },
    },
    {
      key: 'body-metrics',
      type: 'metrics',
      title: 'Body',
      skin: 'delta',
      data: {
        tiles: [
          { id: rid('t'), label: 'Last night', value: '6.4', unit: 'h', trend: 'down' },
          { id: rid('t'), label: 'Resting HR', value: '58', unit: 'bpm', trend: 'flat' },
          { id: rid('t'), label: 'Sessions', value: '3', unit: '', trend: 'up' },
        ],
      },
    },
    {
      key: 'evening',
      type: 'clock_pulse',
      title: 'Every evening',
      skin: 'daily',
      data: { label: 'Evening reset', mode: 'daily', time: '21:30', days: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 60, windowStart: '07:00', windowEnd: '23:00', lastFiredAt: null },
      accent: AMBER,
    },
    {
      key: 'life-alert',
      type: 'notifier',
      title: 'Bin reminder',
      skin: 'reminder',
      data: {
        label: 'Bin reminder',
        message: 'Green bin goes out tonight.',
        channel: 'toast',
        cooldownMinutes: 720,
        armed: true,
        lastFiredAt: null,
        fireCount: 0,
        pendingFireAt: null,
      },
    },
  ])

  life.tree('life-note', ['water', 'meals', 'chores', 'trip', 'review'])
  life.tree('meals', ['recipe', 'pantry'])
  life.tree('trip', ['packing'])
  life.rel('sleep', 'life-goal', 'blocker')
  life.rel('workout', 'sleep', 'cousin')

  life.wire({ from: 'water', fromPort: 'pct_of_target', to: 'life-goal', toPort: 'percent', transform: { op: 'clamp', min: 0, max: 100 } })
  life.wire({ from: 'sleep', fromPort: 'last_night_hours', to: 'body-metrics', toPort: 'value_1' })
  life.wire({ from: 'recipe', fromPort: 'ingredientList', to: 'meals', toPort: 'shoppingList' })
  life.wire({ from: 'bins', fromPort: 'tonight_bin', to: 'life-alert', toPort: 'message' })
  life.wire({ from: 'bins', fromPort: 'is_collection_eve', to: 'life-alert', toPort: 'armed' })
  life.trigger({ from: 'evening', fromPort: 'pulse', to: 'water', command: 'reset_day' })
  life.trigger({ from: 'evening', fromPort: 'pulse', to: 'meds', command: 'uncheck_all' })
  life.trigger({ from: 'bins', fromPort: 'is_collection_eve', to: 'life-alert', command: 'notify' })

  // -- 8. Studio ------------------------------------------------------------

  studio.column([
    {
      key: 'studio-note',
      type: 'notes',
      title: 'The project',
      skin: 'markdown_page',
      data: {
        mode: 'markdown_page',
        text: '# Field Guide\n\nA small print zine about coastal birds.\n\n**Deadline** — print files in six weeks.\n**Open question** — 32 pages or 48?',
      },
      accent: VIOLET,
    },
    {
      key: 'board-outline',
      type: 'outline',
      title: 'Structure',
      skin: 'work_breakdown',
      data: {
        skin: 'work_breakdown',
        items: [
          { id: rid('o'), text: 'Field Guide', depth: 0, collapsed: false },
          { id: rid('o'), text: 'Research', depth: 1, collapsed: false },
          { id: rid('o'), text: 'Species shortlist', depth: 2, collapsed: false },
          { id: rid('o'), text: 'Illustration', depth: 1, collapsed: false },
          { id: rid('o'), text: 'Ink studies', depth: 2, collapsed: false },
          { id: rid('o'), text: 'Layout', depth: 1, collapsed: false },
          { id: rid('o'), text: 'Print and bind', depth: 1, collapsed: false },
        ],
      },
    },
    {
      key: 'kanban',
      type: 'table',
      title: 'Work board',
      skin: 'kanban',
      data: {
        rows: [
          ['Task', 'Owner', 'Status'],
          ['Species shortlist', 'You', 'Done'],
          ['Ink studies — gulls', 'You', 'Doing'],
          ['Cover concepts', 'Amina', 'Doing'],
          ['Paper stock quotes', 'You', 'Todo'],
          ['Proof read', 'Tomas', 'Todo'],
        ],
      },
    },
  ])

  studio.column([
    {
      glue: 'Look and feel',
      cards: [
        {
          key: 'palette',
          type: 'color_palette',
          title: 'Palette',
          skin: 'brand',
          data: { colors: ['#1f2d24', '#5c8f6b', '#c9d8bd', '#e9c46a', '#b5563f'] },
        },
        {
          key: 'whiteboard',
          type: 'sketchpad',
          title: 'Spread sketches',
          skin: 'whiteboard',
          data: { mode: 'whiteboard', height: 320, strokes: [], skinStates: {} },
        },
      ],
    },
    {
      key: 'moodboard',
      type: 'media',
      title: 'Moodboard',
      skin: 'moodboard',
      data: { url: '', caption: 'Ink, muted greens, a lot of paper showing' },
    },
    {
      key: 'brainstorm',
      type: 'ai_generator',
      title: 'Title ideas',
      skin: 'brainstorm',
      data: { prompt: 'Twelve title ideas for a small coastal bird zine — plain, not whimsical.', status: 'idle' },
    },
  ])

  studio.column([
    {
      key: 'decision',
      type: 'decision_matrix',
      title: 'Page count',
      skin: 'weighted_matrix',
      data: {
        criteria: [
          { id: rid('cr'), label: 'Cost', weight: 3 },
          { id: rid('cr'), label: 'Completeness', weight: 2 },
          { id: rid('cr'), label: 'Time to print', weight: 2 },
        ],
        options: [
          { id: rid('op'), label: '32 pages', scores: [5, 3, 5] },
          { id: rid('op'), label: '48 pages', scores: [2, 5, 3] },
          { id: rid('op'), label: '64 pages', scores: [1, 5, 1] },
        ],
      },
    },
    {
      key: 'proscons',
      type: 'pros_cons',
      title: 'Hand-bind?',
      skin: 'weighted_trade_off',
      data: {
        skin: 'weighted_trade_off',
        topic: 'Hand-bind the first run',
        pros: [
          { id: rid('pc'), text: 'Feels like an object, not a pamphlet' },
          { id: rid('pc'), text: 'No minimum order' },
        ],
        cons: [
          { id: rid('pc'), text: 'Two evenings per fifty copies' },
          { id: rid('pc'), text: 'Hard to repeat if it sells' },
        ],
      },
    },
    {
      key: 'swot',
      type: 'swot',
      title: 'Honest look',
      skin: 'one_page',
      data: {
        strengths: ['Distinct illustration voice', 'Subject nobody local covers'],
        weaknesses: ['No distribution', 'Slow at layout'],
        opportunities: ['Two bookshops already asked', 'Bird fair in October'],
        threats: ['Paper costs rising', 'Term restarts in six weeks'],
      },
    },
    {
      key: 'risks',
      type: 'risk_register',
      title: 'Risks',
      skin: 'top_risks',
      data: {
        items: [
          { id: rid('rk'), risk: 'Print quote comes back over budget', likelihood: 3, impact: 4, mitigation: 'Get three quotes before committing', status: 'open' },
          { id: rid('rk'), risk: 'Illustration slips past week 4', likelihood: 3, impact: 3, mitigation: 'Two spreads a week, no exceptions', status: 'open' },
          { id: rid('rk'), risk: 'Copyright on reference photos', likelihood: 2, impact: 4, mitigation: 'Own photos only', status: 'closed' },
        ],
      },
    },
  ])

  studio.column([
    {
      key: 'sop',
      type: 'process',
      title: 'Print runbook',
      skin: 'runbook',
      data: {
        steps: [
          { id: rid('st'), label: 'Export at 300dpi, CMYK', status: 'done' },
          { id: rid('st'), label: 'Check bleed on every spread', status: 'done' },
          { id: rid('st'), label: 'Order a single proof copy', status: 'active' },
          { id: rid('st'), label: 'Sign off proof', status: 'pending' },
          { id: rid('st'), label: 'Release full run', status: 'pending' },
        ],
      },
    },
    {
      key: 'standup',
      type: 'meeting_notes',
      title: 'Check-in',
      skin: 'stand_up',
      data: {
        skin: 'stand_up',
        date: today,
        attendees: 'You, Amina, Tomas',
        notes: 'Cover concepts down to two. Paper decision blocked on quotes.',
        actions: [
          { id: rid('a'), text: 'Send both covers to the bookshop', done: false },
          { id: rid('a'), text: 'Chase paper quotes', done: false },
          { id: rid('a'), text: 'Book the proof slot', done: true },
        ],
      },
    },
    {
      key: 'poll',
      type: 'poll',
      title: 'Cover vote',
      skin: 'bars',
      data: {
        skin: 'bars',
        question: 'Which cover?',
        options: [
          { id: rid('pl'), label: 'Gull, close crop', votes: 7 },
          { id: rid('pl'), label: 'Empty shoreline', votes: 11 },
          { id: rid('pl'), label: 'Typographic only', votes: 3 },
        ],
      },
    },
    {
      key: 'rating',
      type: 'rating',
      title: 'Cover confidence',
      skin: 'confidence',
      data: { label: 'Confidence in the shoreline cover', value: 4, max: 5 },
    },
  ])

  studio.column([
    {
      key: 'snippets',
      type: 'snippet_library',
      title: 'Stock replies',
      skin: 'writing',
      data: {
        entries: [
          { id: rid('sn'), title: 'Stockist enquiry', body: 'Thanks for getting in touch — wholesale is 50% of the £12 cover price, minimum ten copies.', tags: ['sales'], useCount: 9 },
          { id: rid('sn'), title: 'Print spec', body: '210×148mm, 120gsm uncoated inner, 300gsm cover, saddle stitched.', tags: ['print'], useCount: 4 },
        ],
      },
    },
    {
      key: 'studio-links',
      type: 'links',
      title: 'References',
      skin: 'bookmark_grid',
      data: {
        items: [
          { id: rid('l'), label: 'RSPB species guide', url: 'https://www.rspb.org.uk' },
          { id: rid('l'), label: 'Paper stock samples', url: 'https://example.com/paper' },
          { id: rid('l'), label: 'Local print co-op', url: 'https://example.com/print' },
        ],
      },
    },
    {
      key: 'code',
      type: 'code',
      title: 'Imposition script',
      skin: 'editor',
      data: {
        language: 'ts',
        code: 'const spreads = pages.length / 4\nfor (let i = 0; i < spreads; i++) {\n  sheet(pages[pages.length - 1 - i * 2], pages[i * 2])\n}',
      },
    },
    {
      key: 'studio-line',
      type: 'template',
      title: 'Where the project is',
      skin: 'sentence',
      data: { template: '{a} · cover: {b} · next: {c}', slotA: '32 pages', slotB: 'Empty shoreline', slotC: 'Order a single proof copy', slotD: '' },
      accent: VIOLET,
    },
    {
      key: 'studio-status',
      type: 'status',
      title: 'Project',
      skin: 'progress',
      data: { label: 'Field Guide', value: 'in_progress' },
    },
  ])

  studio.tree('studio-note', ['board-outline', 'decision', 'sop', 'whiteboard'])
  studio.tree('board-outline', ['kanban', 'palette', 'brainstorm'])
  studio.tree('decision', ['proscons', 'swot', 'poll'])
  studio.rel('risks', 'sop', 'blocker')
  studio.rel('standup', 'kanban', 'cousin')

  studio.wire({ from: 'decision', fromPort: 'winner', to: 'studio-line', toPort: 'a' })
  studio.wire({ from: 'poll', fromPort: 'leader', to: 'studio-line', toPort: 'b' })
  studio.wire({ from: 'sop', fromPort: 'current_step', to: 'studio-line', toPort: 'c' })
  studio.wire({ from: 'poll', fromPort: 'leader_share', to: 'rating', toPort: 'value', transform: { op: 'map_range', inMin: 0, inMax: 100, outMin: 0, outMax: 5 } })

  // -- 9. Automation Lab ----------------------------------------------------
  //
  // Laid out as three readable stages — inputs, logic, outputs — so the wires
  // run left to right on camera instead of crossing.

  lab.column([
    {
      key: 'lab-note',
      type: 'notes',
      title: 'How wiring works',
      skin: 'callout',
      data: {
        mode: 'callout',
        text: 'Drag from a port on one card to a port on another.\n\nBlue carries numbers, green carries yes/no, purple carries text, amber carries a series, and rose fires events.',
      },
      accent: AMBER,
    },
    {
      key: 'dial',
      type: 'number_input',
      title: 'Target',
      skin: 'slider',
      data: { label: 'Weekly target', value: 40, min: 0, max: 100, step: 5 },
      accent: AZURE,
    },
    {
      key: 'switch',
      type: 'toggle',
      title: 'Working hours',
      skin: 'switch',
      data: { label: 'Working hours', value: true },
      accent: LIME,
    },
    {
      key: 'tally',
      type: 'counter',
      title: 'Done today',
      skin: 'clicker',
      data: { label: 'Done today', count: 12, step: 1, skin: 'clicker' },
    },
    {
      key: 'pulse',
      type: 'clock_pulse',
      title: 'Every hour',
      skin: 'interval',
      data: { label: 'Hourly', mode: 'interval', time: '09:00', days: [1, 2, 3, 4, 5], intervalMinutes: 60, windowStart: '09:00', windowEnd: '18:00', lastFiredAt: null },
      accent: ROSE,
    },
  ])

  lab.column([
    {
      key: 'calc',
      type: 'formula',
      title: 'Percent of target',
      skin: 'ratio',
      data: { label: 'Percent of target', a: 12, b: 40, operator: 'divide' },
      accent: AZURE,
    },
    {
      key: 'sum',
      type: 'aggregator',
      title: 'Total effort',
      skin: 'sum',
      data: { label: 'Total effort', mode: 'sum', slots: [0, 0, 0, 0, 0, 0] },
    },
    {
      key: 'check',
      type: 'comparator',
      title: 'Behind pace?',
      skin: 'threshold',
      data: { label: 'Behind pace?', op: 'lt', a: 30, b: 60, low: 0, high: 100 },
      accent: LIME,
    },
    {
      key: 'bands',
      type: 'range_mapper',
      title: 'Pace band',
      skin: 'gradient',
      data: {
        label: 'Pace band',
        input: 30,
        bands: [
          { id: rid('bd'), upTo: 25, label: 'Way behind', emoji: '🔴' },
          { id: rid('bd'), upTo: 60, label: 'Behind', emoji: '🟠' },
          { id: rid('bd'), upTo: 90, label: 'On pace', emoji: '🟡' },
          { id: rid('bd'), upTo: Number.MAX_SAFE_INTEGER, label: 'Ahead', emoji: '🟢' },
        ],
      },
    },
  ])

  lab.column([
    {
      key: 'hold',
      type: 'latch',
      title: 'Last hour',
      skin: 'peak_hold',
      data: { label: 'Last hour', current: 30, held: 24, heldAt: null },
    },
    {
      key: 'words',
      type: 'template',
      title: 'Sentence',
      skin: 'sentence',
      data: { template: '{a} — {b} of {c} done this week', slotA: 'Behind', slotB: '12', slotC: '40', slotD: '' },
      accent: VIOLET,
    },
    {
      key: 'steps',
      type: 'sequencer',
      title: 'Weekly rhythm',
      skin: 'round_robin',
      data: {
        label: 'Weekly rhythm',
        activeIndex: 2,
        loop: true,
        steps: [
          { id: rid('sq'), text: 'Plan on Monday' },
          { id: rid('sq'), text: 'Deep work Tue–Thu' },
          { id: rid('sq'), text: 'Review on Friday' },
          { id: rid('sq'), text: 'Rest at the weekend' },
        ],
      },
    },
  ])

  lab.column([
    {
      key: 'ring',
      type: 'goal_tracker',
      title: 'Weekly progress',
      skin: 'simple',
      data: { mode: 'simple', goal: 'Weekly progress', simple: { label: 'Progress', percent: 30 } },
    },
    {
      key: 'gauge',
      type: 'bar_chart',
      title: 'Pace',
      skin: 'gauge',
      data: {
        title: 'Pace',
        mode: 'gauge',
        unit: '%',
        bars: bars([['Pace', 30]], [AZURE]),
      },
    },
    {
      key: 'lab-status',
      type: 'status',
      title: 'Pace',
      skin: 'traffic_light',
      data: { label: 'Pace', value: 'blocked' },
    },
    {
      key: 'lab-metrics',
      type: 'metrics',
      title: 'Live',
      skin: 'big_number',
      data: {
        tiles: [
          { id: rid('t'), label: 'Effort', value: '12', unit: '', trend: 'up' },
          { id: rid('t'), label: 'Target', value: '40', unit: '', trend: 'flat' },
        ],
      },
    },
    {
      key: 'lab-alert',
      type: 'notifier',
      title: 'Pace alert',
      skin: 'in_app',
      data: {
        label: 'Pace alert',
        message: 'Behind pace for this week.',
        channel: 'toast',
        cooldownMinutes: 120,
        armed: true,
        lastFiredAt: null,
        fireCount: 0,
        pendingFireAt: null,
      },
      accent: ROSE,
    },
  ])

  lab.tree('lab-note', ['dial', 'switch', 'tally', 'pulse'])
  lab.tree('calc', ['ring', 'gauge'])
  lab.rel('check', 'lab-alert', 'blocker')

  // numbers
  lab.wire({ from: 'tally', fromPort: 'count', to: 'calc', toPort: 'a' })
  lab.wire({ from: 'dial', fromPort: 'value', to: 'calc', toPort: 'b' })
  lab.wire({ from: 'calc', fromPort: 'result', to: 'ring', toPort: 'percent', transform: { op: 'scale', factor: 100 } })
  lab.wire({ from: 'calc', fromPort: 'result', to: 'bands', toPort: 'input', transform: { op: 'scale', factor: 100 } })
  lab.wire({ from: 'calc', fromPort: 'result', to: 'check', toPort: 'a', transform: { op: 'scale', factor: 100 } })
  lab.wire({ from: 'calc', fromPort: 'result', to: 'hold', toPort: 'current', transform: { op: 'scale', factor: 100 } })
  lab.wire({ from: 'tally', fromPort: 'count', to: 'sum', toPort: 'in1' })
  lab.wire({ from: 'dial', fromPort: 'value', to: 'sum', toPort: 'in2' })
  lab.wire({ from: 'sum', fromPort: 'value', to: 'lab-metrics', toPort: 'value_1' })
  // text
  lab.wire({ from: 'bands', fromPort: 'label', to: 'words', toPort: 'a' })
  lab.wire({ from: 'steps', fromPort: 'current', to: 'words', toPort: 'b' })
  lab.wire({ from: 'words', fromPort: 'text', to: 'lab-alert', toPort: 'message' })
  // booleans and events
  lab.wire({ from: 'check', fromPort: 'result', to: 'lab-alert', toPort: 'armed' })
  lab.trigger({ from: 'switch', fromPort: 'value', to: 'steps', command: 'reset', edge: 'falling' })
  lab.trigger({ from: 'pulse', fromPort: 'pulse', to: 'hold', command: 'capture' })
  lab.trigger({ from: 'pulse', fromPort: 'pulse', to: 'steps', command: 'advance' })
  lab.trigger({ from: 'check', fromPort: 'result', to: 'lab-alert', command: 'notify' })
  lab.trigger({ from: 'switch', fromPort: 'value', to: 'tally', command: 'reset', edge: 'falling' })

  return board
}
