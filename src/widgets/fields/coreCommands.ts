import type { ModuleType,
  BranchGateData,
  BulletsData,
  ChecklistData,
  CounterData,
  DecisionData,
  FlashcardsData,
  FormWidgetData,
  GoalTrackerData,
  HabitData,
  LinksData,
  MeetingNotesData,
  MoodTrackerData,
  NumberInputData,
  PollData,
  ProcessData,
  RatingData,
  ReadingListData,
  RiskRegisterData,
  SketchpadData,
  StatusData,
  TimekeeperData,
  ToggleData,
} from '../../types/spatial'
import type { CommandDescriptor } from '../contracts/fields'
import { text, isValidTimeZone } from './valueHelpers'
import { resetPollVotes } from '../../components/widgets/modules/pollSkinModel'

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
        // The worn skin and its own state ride along untouched — a wire adds a
        // point to the list, it does not reshape the card.
        return { ...data, items: [...data.items, item] }
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
          ...(d as LinksData),
          items: [
            ...(d as LinksData).items,
            { id: crypto.randomUUID(), label: looksLikeUrl ? '' : value, url: looksLikeUrl ? value : '' },
          ],
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
      // Ballots, duel records, and room phase are the same result told another
      // way, so clearing votes has to clear them too or the runoff would keep
      // reporting a winner the tally no longer knows about.
      label: 'Clear votes',
      run: (d) => resetPollVotes(d as PollData),
    },
  ],
  mood_tracker: [
    {
      key: 'reset',
      label: 'Clear the week',
      run: (d) => ({ ...(d as MoodTrackerData), days: Array(7).fill(null) }),
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
      // Inherited from the retired Progress card, whose only command this was.
      // It belongs to the Simple skin, which is what that card became.
      key: 'reset',
      label: 'Reset to 0%',
      run: (d) => {
        const goal = d as GoalTrackerData
        return {
          ...goal,
          simple: { label: (goal.simple?.label ?? goal.goal) || 'Progress', percent: 0 },
        }
      },
    },
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
        ...(d as ReadingListData),
        items: (d as ReadingListData).items.map((i) => ({ ...i, status: 'queued' as const })),
      }),
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
  process: [
    {
      key: 'reset',
      label: 'Restart process',
      run: (d) => ({ ...(d as ProcessData), steps: (d as ProcessData).steps.map((step, index) => ({ ...step, status: index === 0 ? 'active' as const : 'todo' as const })) }),
    },
    {
      key: 'check_all',
      label: 'Complete process',
      run: (d) => ({ ...(d as ProcessData), steps: (d as ProcessData).steps.map((step) => ({ ...step, status: 'done' as const })) }),
    },
  ],
  risk_register: [
    {
      key: 'reset',
      label: 'Reopen all risks',
      run: (d) => ({ ...(d as RiskRegisterData), items: (d as RiskRegisterData).items.map((item) => ({ ...item, status: 'open' as const })) }),
    },
  ],
} satisfies Partial<Record<ModuleType, CommandDescriptor[]>>
