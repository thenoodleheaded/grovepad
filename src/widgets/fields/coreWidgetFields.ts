import type { ModuleType,
  BudgetData,
  ChecklistData,
  CountdownData,
  CounterData,
  GoalTrackerData,
  HabitData,
  LinkedListData,
  NotesData,
  PollData,
  ProgressData,
  QuoteData,
  RatingData,
  StickyNoteData,
  StopwatchData,
  TimerData,
  TimekeeperData,
  AtlasWidgetData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { num, text, bool, primaryZoneTime } from './valueHelpers'
import {
  linkedListNodes,
  linkedNodeIndex,
  selectedLinkedNodeId,
  writeCurrentLinkedValue,
} from '../../components/widgets/modules/linkedListSkinModel'

/** Everyday widget fields (notes … tracker). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const CORE_WIDGET_FIELDS = {
  notes: [
    {
      key: 'text',
      label: 'Text',
      valueType: 'text',
      get: (d) => (d as NotesData).text,
      set: (d, v) => ({ ...(d as NotesData), text: text(v) }),
    },
  ],
  linked_list: [
    {
      key: 'head',
      label: 'Head value',
      valueType: 'text',
      get: (d) => linkedListNodes((d as LinkedListData).nodes)[0]?.value ?? '',
    },
    {
      key: 'tail',
      label: 'Tail value',
      valueType: 'text',
      get: (d) => linkedListNodes((d as LinkedListData).nodes).at(-1)?.value ?? '',
    },
    {
      key: 'current',
      label: 'Current value',
      valueType: 'text',
      get: (d) => {
        const data = d as LinkedListData
        const nodes = linkedListNodes(data.nodes)
        return nodes[linkedNodeIndex(nodes, selectedLinkedNodeId(nodes, data.selectedId))]?.value ?? ''
      },
      set: (d, value) => writeCurrentLinkedValue(d as LinkedListData, text(value)),
    },
    {
      key: 'length',
      label: 'Node count',
      valueType: 'number',
      unit: 'count',
      get: (d) => linkedListNodes((d as LinkedListData).nodes).length,
    },
    {
      key: 'empty',
      label: 'Is empty',
      valueType: 'boolean',
      get: (d) => linkedListNodes((d as LinkedListData).nodes).length === 0,
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
        const goal = d as GoalTrackerData
        if (goal.mode === 'simple') return goal.simple?.percent ?? 0
        if (goal.mode === 'hours') return goal.hours && goal.hours.targetHours > 0
          ? Math.min(100, Math.round(goal.hours.loggedHours / goal.hours.targetHours * 100))
          : 0
        if (goal.mode === 'okr') {
          const results = goal.okr?.keyResults ?? []
          const weight = results.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || 1
          return results.reduce((sum, item) => sum + Math.min(1, Math.max(0, item.current / Math.max(1, item.target))) * Math.max(0, item.weight), 0) / weight * 100
        }
        const ms = goal.milestones
        return ms.length === 0 ? 0 : Math.round((ms.filter((m) => m.done).length / ms.length) * 100)
      },
      set: (d, v) => {
        const goal = d as GoalTrackerData
        return {
          ...goal,
          simple: {
            label: (goal.simple?.label ?? goal.goal) || 'Progress',
            percent: Math.min(100, Math.max(0, Math.round(num(v)))),
          },
        }
      },
    },
    {
      key: 'complete',
      label: 'Complete',
      valueType: 'boolean',
      get: (d) => {
        const goal = d as GoalTrackerData
        if (goal.mode === 'simple') return (goal.simple?.percent ?? 0) >= 100
        if (goal.mode === 'hours') return Boolean(goal.hours && goal.hours.targetHours > 0 && goal.hours.loggedHours >= goal.hours.targetHours)
        if (goal.mode === 'okr') return Boolean(goal.okr?.keyResults.length && goal.okr.keyResults.every((item) => item.current >= item.target))
        return goal.milestones.length > 0 && goal.milestones.every((m) => m.done)
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
    {
      key: 'days_until',
      label: 'Days until',
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
    { key:'mode',label:'Mode',valueType:'text',get:()=> 'countdown' },
  ],
  timekeeper: [
    {
      key: 'running',
      label: 'Running',
      valueType: 'boolean',
      get: (d) => {
        const value=d as TimekeeperData
        if(value.mode==='pomodoro')return value.pomodoro.endAt!==null
        if(value.mode==='stopwatch')return value.stopwatch.startedAt!==null
        if(value.mode==='lap_timer')return value.stopwatch.startedAt!==null
        if(value.mode==='intervals'||value.mode==='tabata'||value.mode==='multi_stage_timer') {
          return typeof value.skinStates?.[value.mode]?.endAt === 'number'
        }
        if(value.mode==='deadline'||value.mode==='world_clock'||value.mode==='chess_clock')return false
        return value.countdown.endAt!==null
      },
    },
    { key:'mode',label:'Mode',valueType:'text',get:(d)=>(d as TimekeeperData).mode },
    {
      key: 'days_left',
      label: 'Days left',
      valueType: 'number',
      unit: 'count',
      timeSensitive: true,
      get: (d) => {
        const target = (d as TimekeeperData).deadline?.targetDate
        if (!target) return 0
        return Math.ceil((new Date(`${target}T00:00:00`).getTime() - Date.now()) / 86_400_000) || 0
      },
    },
    {
      key: 'days_until',
      label: 'Days until',
      valueType: 'number',
      unit: 'count',
      timeSensitive: true,
      get: (d) => {
        const target = (d as TimekeeperData).deadline?.targetDate
        if (!target) return 0
        return Math.ceil((new Date(`${target}T00:00:00`).getTime() - Date.now()) / 86_400_000) || 0
      },
    },
    {
      key: 'sessions_done',
      label: 'Sessions done',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as TimekeeperData).pomodoro.completed,
    },
    {
      key: 'completed',
      label: 'Completed sessions',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as TimekeeperData).pomodoro.completed,
    },
    {
      key: 'primary_time',
      label: 'Primary time',
      valueType: 'text',
      timeSensitive: true,
      get: (d) => primaryZoneTime((d as TimekeeperData).worldClock?.zones ?? []),
    },
    {
      key: 'zone_count',
      label: 'Time zones',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as TimekeeperData).worldClock?.zones.length ?? 0,
    },
  ],
  tracker: [
    { key:'current',label:'Current',valueType:'number',get:(d)=>(d as AtlasWidgetData).primary,set:(d,v)=>({...d as AtlasWidgetData,primary:num(v)}) },
    { key:'target',label:'Target',valueType:'number',get:(d)=>(d as AtlasWidgetData).target,set:(d,v)=>({...d as AtlasWidgetData,target:num(v)}) },
    { key:'active',label:'Active',valueType:'boolean',get:(d)=>(d as AtlasWidgetData).enabled,set:(d,v)=>({...d as AtlasWidgetData,enabled:bool(v)}) },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
