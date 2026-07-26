import type { ModuleType,
  AssignmentData,
  BranchGateData,
  BulletsData,
  ChecklistData,
  CounterData,
  DailyAgendaData,
  DecisionData,
  FlashcardsData,
  FormWidgetData,
  GoalTrackerData,
  HabitData,
  KanbanData,
  LinkedListData,
  LinksData,
  MeetingNotesData,
  NumberInputData,
  PollData,
  PomodoroData,
  ProcessData,
  ProgressData,
  QuizData,
  RatingData,
  ReadingListData,
  RiskRegisterData,
  SketchpadData,
  StudyGoalData,
  StatusData,
  TimerData,
  TimekeeperData,
  ToggleData,
  VocabData,
  WeeklyPlannerData,
  WorldClockData,
} from '../../types/spatial'
import type { CommandDescriptor } from '../contracts/fields'
import { text, isValidTimeZone } from './valueHelpers'
import {
  appendLinkedNode,
  linkedListNodes,
  neighboringNodeId,
  removeLinkedNode,
  reverseLinkedNodes,
  selectedLinkedNodeId,
} from '../../components/widgets/modules/linkedListSkinModel'

/** Inline widget commands, extracted verbatim from fields.ts; key order preserved. */
export const CORE_WIDGET_COMMANDS = {
  sketchpad: [
    {
      key: 'clear',
      label: 'Clear current drawing',
      run: (d) => {
        const value = d as SketchpadData
        if (value.mode === 'diagram') {
          return {
            ...value,
            diagram: {
              elements: [],
              appState: value.diagram?.appState ?? {},
              files: [],
              updatedAt: new Date().toISOString(),
            },
          }
        }
        if (value.mode === 'storyboard') {
          const frames = value.skinStates?.storyboard?.frames
          if (!Array.isArray(frames)) return value
          return {
            ...value,
            skinStates: {
              ...value.skinStates,
              storyboard: {
                ...value.skinStates?.storyboard,
                frames: frames.map((frame) =>
                  frame && typeof frame === 'object'
                    ? { ...frame as object, strokes: [] }
                    : frame,
                ),
              },
            },
          }
        }
        return { ...value, strokes: [] }
      },
    },
  ],
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
  timekeeper: [
    {
      key:'reset',label:'Reset current timer',run:(d)=>{
        const value=d as TimekeeperData
        if(value.mode==='pomodoro')return {...value,pomodoro:{...value.pomodoro,phase:'work' as const,endAt:null,remainingSeconds:value.pomodoro.workMinutes*60,completed:0}}
        if(value.mode==='stopwatch'||value.mode==='lap_timer')return {...value,stopwatch:{elapsedMs:0,startedAt:null,laps:[]}}
        if(value.mode==='intervals'||value.mode==='tabata'||value.mode==='chess_clock'||value.mode==='multi_stage_timer') {
          return {...value,skinStates:{...value.skinStates,[value.mode]:{}}}
        }
        if(value.mode==='deadline'||value.mode==='world_clock')return value
        return {...value,countdown:{...value.countdown,remainingSeconds:value.countdown.durationSeconds,endAt:null}}
      },
    },
    {
      key: 'add_zone',
      label: 'Add timezone from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const value = d as TimekeeperData
        const zone = text(payload ?? '').trim()
        const zones = value.worldClock?.zones ?? []
        if (!zone || zones.includes(zone) || !isValidTimeZone(zone)) return value
        return { ...value, worldClock: { zones: [...zones, zone] } }
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
  // Each command spreads the card's own data: a wire that ticks or adds a task
  // must not strip the arrangement it is worn in, or a Board silently becomes
  // a List the first time a circuit fires. `status` moves with `done` so no
  // skin is left disagreeing about what is finished.
  checklist: [
    {
      key: 'uncheck_all',
      label: 'Uncheck all tasks',
      run: (d) => ({
        ...(d as ChecklistData),
        items: (d as ChecklistData).items.map((i) => ({ ...i, done: false, status: 'todo' as const })),
      }),
    },
    {
      key: 'check_all',
      label: 'Check all tasks',
      run: (d) => ({
        ...(d as ChecklistData),
        items: (d as ChecklistData).items.map((i) => ({ ...i, done: true, status: 'done' as const })),
      }),
    },
    {
      key: 'add_item',
      label: 'Add task from wire',
      acceptsPayload: true,
      run: (d, payload) => ({
        ...(d as ChecklistData),
        items: [
          ...(d as ChecklistData).items,
          {
            id: crypto.randomUUID(),
            label: text(payload ?? '').trim() || 'New task',
            done: false,
            status: 'todo' as const,
          },
        ],
      }),
    },
  ],
  bullets: [
    {
      key: 'add_item',
      label: 'Add bullet from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const data = d as BulletsData
        const item = {
          id: crypto.randomUUID(),
          text: text(payload ?? '').trim() || 'New item',
        }
        const next = { ...data, items: [...data.items, item] }
        if (data.skin !== 'rolling_log') return next
        const logState = data.skinStates?.rolling_log ?? {}
        const timestamps = logState.timestamps &&
          typeof logState.timestamps === 'object' &&
          !Array.isArray(logState.timestamps)
          ? logState.timestamps as Record<string, unknown>
          : {}
        return {
          ...next,
          skinStates: {
            ...data.skinStates,
            rolling_log: {
              ...logState,
              timestamps: {
                ...timestamps,
                [item.id]: new Date().toISOString(),
              },
            },
          },
        }
      },
    },
  ],
  linked_list: [
    {
      key: 'add_node',
      label: 'Append node from wire',
      acceptsPayload: true,
      run: (d, payload) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        const next = appendLinkedNode(nodes, text(payload ?? '').trim())
        return { ...data, nodes: next.nodes, selectedId: next.selectedId }
      },
    },
    {
      key: 'next',
      label: 'Select next node',
      run: (d) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        const selectedId = selectedLinkedNodeId(nodes, data.selectedId)
        return {
          ...data,
          nodes,
          selectedId: neighboringNodeId(nodes, selectedId, 1, data.skin === 'circular'),
        }
      },
    },
    {
      key: 'previous',
      label: 'Select previous node',
      run: (d) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        const selectedId = selectedLinkedNodeId(nodes, data.selectedId)
        return {
          ...data,
          nodes,
          selectedId: neighboringNodeId(nodes, selectedId, -1, data.skin === 'circular'),
        }
      },
    },
    {
      key: 'reverse',
      label: 'Reverse the list',
      run: (d) => {
        const data = d as LinkedListData
        return { ...data, nodes: reverseLinkedNodes(linkedListNodes(data.nodes)) }
      },
    },
    {
      key: 'remove_current',
      label: 'Remove current node',
      run: (d) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        const selectedId = selectedLinkedNodeId(nodes, data.selectedId)
        if (!selectedId) return { ...data, nodes, selectedId: null }
        const next = removeLinkedNode(nodes, selectedId)
        return { ...data, nodes: next.nodes, selectedId: next.selectedId }
      },
    },
    {
      key: 'head',
      label: 'Select head',
      run: (d) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        return { ...data, nodes, selectedId: nodes[0]?.id ?? null }
      },
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
} satisfies Partial<Record<ModuleType, CommandDescriptor[]>>
