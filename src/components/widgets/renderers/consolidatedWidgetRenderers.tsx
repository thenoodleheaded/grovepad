import type {
  BarChartData,
  ChecklistData,
  DecisionData,
  ExcalidrawData,
  FlashcardsData,
  GoalTrackerData,
  NotesData,
  SketchpadData,
} from '../../../types/widgetDataCore'
import type { GradeCalcData } from '../../../types/widgetDataEducation'
import type { DatePickerData } from '../../../types/widgetDataWorkflow'
import type { ModuleData } from '../../../types/spatial'
import { localDayKey } from '../../../utils/localDate'
import type { WidgetRendererFamily } from './contracts'
import {
  BarChartWidget,
  ChecklistWidget,
  CountdownWidget,
  DecisionWidget,
  ExcalidrawWidget,
  FlashcardsWidget,
  GoalTrackerWidget,
  KanbanWidget,
  NotesWidget,
  PriorityMatrixWidget,
  ProgressWidget,
  QuoteWidget,
  SketchpadWidget,
  StickyNoteWidget,
  TimelineWidget,
  WeeklyPlannerWidget,
} from './lazyCoreWidgets'
import {
  AssignmentWidget,
  GpaWidget,
  GradeCalcWidget,
  QuizWidget,
  StudyGoalWidget,
  VocabWidget,
} from './lazyEducationWidgets'
import {
  DailyAgendaWidget,
  DatePickerWidget,
  LineChartWidget,
  PieChartWidget,
} from './lazyWorkflowWidgets'
import { ExpansionWidget } from './lazyCatalogWidgets'

const uid = () => crypto.randomUUID()
const chartColors = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf']

function mergeTaskItems(
  previous: ChecklistData['items'],
  next: ChecklistData['items'],
): ChecklistData['items'] {
  const byId = new Map(previous.map((item) => [item.id, item]))
  return next.map((item) => ({ ...byId.get(item.id), ...item }))
}

/** Canonical widget types own their mode state; these renderers adapt that
 * state into the mature standalone editor for the selected mode. */
export const consolidatedWidgetRendererFamily: WidgetRendererFamily = {
  id: 'consolidated-modes',
  renderers: {
    notes: ({ widget, onUpdate, onHeightChange }) => {
      const data = widget.data as NotesData
      const mode = data.mode ?? 'plain'
      if (mode === 'sticky') {
        return <StickyNoteWidget widgetId={widget.id} data={{ text: data.text, color: data.color ?? 'yellow' }} onChange={(next) => onUpdate({ ...data, text: next.text, color: next.color } as ModuleData)} onHeightChange={onHeightChange} />
      }
      if (mode === 'quote') {
        return <QuoteWidget data={{ text: data.text, attribution: data.attribution ?? '' }} onChange={(next) => onUpdate({ ...data, text: next.text, attribution: next.attribution } as ModuleData)} />
      }
      return <NotesWidget widgetId={widget.id} data={data} onChange={onUpdate} onHeightChange={onHeightChange} />
    },

    bar_chart: ({ widget, onUpdate }) => {
      const data = widget.data as BarChartData
      const mode = data.mode ?? 'bar'
      if (mode === 'line') {
        return <LineChartWidget data={{ title: data.title, unit: data.unit ?? '', points: data.bars }} onChange={(next) => onUpdate({ ...data, title: next.title, unit: next.unit, bars: next.points.map((point, index) => ({ ...point, color: data.bars.find((item) => item.id === point.id)?.color ?? chartColors[index % chartColors.length] })) } as ModuleData)} />
      }
      if (mode === 'donut' || mode === 'pie') {
        return <PieChartWidget data={{ title: data.title, mode, segments: data.bars.map((item, index) => ({ ...item, color: item.color ?? chartColors[index % chartColors.length]! })) }} onChange={(next) => onUpdate({ ...data, title: next.title, mode: next.mode, bars: next.segments } as ModuleData)} />
      }
      return <BarChartWidget data={data} onChange={(next) => onUpdate({ ...data, title: next.title, bars: next.bars } as ModuleData)} />
    },

    decision: ({ widget, onUpdate, onHeightChange }) => {
      const data = widget.data as DecisionData
      if ((data.mode ?? 'simple') === 'weighted') {
        const weighted = {
          label: data.question || 'Decide for me',
          options: data.options.map((text, index) => ({ id: `option-${index}`, text, weight: data.weights?.[index] ?? 1 })),
          pick: data.pickedIndex == null ? '' : data.options[data.pickedIndex] ?? '',
          history: data.history ?? [],
          lastRolledAt: data.lastRolledAt ?? null,
          noRepeatWindow: data.noRepeatWindow ?? 1,
        }
        return <ExpansionWidget type="random_picker" data={weighted} onChange={(nextData) => {
          const next = nextData as typeof weighted
          const pickedIndex = next.pick ? next.options.findIndex((option) => option.text === next.pick) : null
          onUpdate({ ...data, question: next.label, options: next.options.map((option) => option.text), weights: next.options.map((option) => option.weight), pickedIndex: pickedIndex === -1 ? null : pickedIndex, history: next.history, lastRolledAt: next.lastRolledAt, noRepeatWindow: next.noRepeatWindow } as ModuleData)
        }} />
      }
      return <DecisionWidget data={data} onChange={(next) => onUpdate({ ...data, question: next.question, options: next.options, pickedIndex: next.pickedIndex } as ModuleData)} onHeightChange={onHeightChange} />
    },

    grade_calc: ({ widget, onUpdate }) => {
      const data = widget.data as GradeCalcData
      if ((data.mode ?? 'weighted') === 'gpa') {
        const gpa = data.gpa ?? { courses: [{ id: uid(), name: '', credits: 3, points: 4 }] }
        return <GpaWidget data={gpa} onChange={(next) => onUpdate({ ...data, gpa: next } as ModuleData)} />
      }
      return <GradeCalcWidget data={data} onChange={(next) => onUpdate({ ...data, components: next.components } as ModuleData)} />
    },

    date_picker: ({ widget, onUpdate }) => {
      const data = widget.data as DatePickerData
      if ((data.mode ?? 'date_time') === 'countdown') {
        return <CountdownWidget data={{ label: data.label, targetDate: data.date }} onChange={(next) => onUpdate({ ...data, label: next.label, date: next.targetDate } as ModuleData)} />
      }
      return <DatePickerWidget data={data} onChange={(next) => onUpdate({ ...data, ...next, mode: data.mode ?? 'date_time' } as ModuleData)} />
    },

    sketchpad: ({ widget, onUpdate }) => {
      const data = widget.data as SketchpadData
      if ((data.mode ?? 'ink') === 'diagram') {
        const diagram: ExcalidrawData = data.diagram ?? { elements: [], appState: {}, files: [], updatedAt: new Date().toISOString() }
        return <ExcalidrawWidget data={diagram} widgetId={widget.id} title={widget.title} onChange={(next) => onUpdate({ ...data, diagram: next } as ModuleData)} />
      }
      return <SketchpadWidget widgetId={widget.id} data={data} onChange={(next) => onUpdate({ ...data, ...next, mode: data.mode ?? 'ink' } as ModuleData)} />
    },

    goal_tracker: ({ widget, onUpdate }) => {
      const data = widget.data as GoalTrackerData
      const mode = data.mode ?? 'milestones'
      if (mode === 'simple') {
        const simple = data.simple ?? { label: data.goal || 'Progress', percent: 0 }
        return <ProgressWidget data={simple} onChange={(next) => onUpdate({ ...data, simple: next } as ModuleData)} />
      }
      if (mode === 'hours') {
        const hours = data.hours ?? { subject: data.goal, targetHours: 10, loggedHours: 0 }
        return <StudyGoalWidget data={hours} onChange={(next) => onUpdate({ ...data, hours: next } as ModuleData)} />
      }
      if (mode === 'okr') {
        const okr = data.okr ?? { objective: data.goal, keyResults: [{ id: uid(), label: '', current: 0, target: 100, weight: 1 }] }
        return <ExpansionWidget type="okr" data={okr} onChange={(next) => onUpdate({ ...data, okr: next as typeof okr } as ModuleData)} />
      }
      return <GoalTrackerWidget data={data} onChange={(next) => onUpdate({ ...data, goal: next.goal, milestones: next.milestones } as ModuleData)} />
    },

    flashcards: ({ widget, onUpdate }) => {
      const data = widget.data as FlashcardsData
      const mode = data.mode ?? 'flashcards'
      if (mode === 'vocabulary') {
        const vocabulary = data.vocabulary ?? { terms: [{ id: uid(), term: '', definition: '', known: false }] }
        return <VocabWidget data={vocabulary} onChange={(next) => onUpdate({ ...data, vocabulary: next } as ModuleData)} />
      }
      if (mode === 'quiz') {
        const quiz = data.quiz ?? { prompt: '', options: [{ id: uid(), text: '', correct: true }, { id: uid(), text: '', correct: false }], picked: null }
        return <QuizWidget data={quiz} onChange={(next) => onUpdate({ ...data, quiz: next } as ModuleData)} />
      }
      return <FlashcardsWidget data={data} onChange={(next) => onUpdate({ ...data, cards: next.cards, current: next.current } as ModuleData)} />
    },

    checklist: ({ widget, onUpdate, onHeightChange }) => {
      const data = widget.data as ChecklistData
      const mode = data.mode ?? 'list'
      const updateItems = (items: ChecklistData['items']) => onUpdate({ ...data, items: mergeTaskItems(data.items, items) } as ModuleData)
      if (mode === 'board') {
        const columns = (['todo', 'doing', 'done'] as const).map((status) => ({ id: status, label: status === 'todo' ? 'To do' : status === 'doing' ? 'Doing' : 'Done', cards: data.items.filter((item) => (item.status ?? (item.done ? 'done' : 'todo')) === status).map((item) => ({ id: item.id, label: item.label })) }))
        return <KanbanWidget data={{ columns }} onChange={(next) => updateItems(next.columns.flatMap((column, index) => column.cards.map((card) => ({ id: card.id, label: card.label, done: index === next.columns.length - 1, status: index === 0 ? 'todo' : index === next.columns.length - 1 ? 'done' : 'doing' }))))} />
      }
      if (mode === 'assignments') {
        return <AssignmentWidget data={{ items: data.items.map((item) => ({ id: item.id, title: item.label, due: item.due ?? '', status: item.status ?? (item.done ? 'done' : 'todo') })) }} onChange={(next) => updateItems(next.items.map((item) => ({ id: item.id, label: item.title ?? '', done: item.status === 'done', status: item.status, due: item.due })))} />
      }
      if (mode === 'day') {
        const date = data.items.find((item) => item.due)?.due ?? localDayKey()
        return <DailyAgendaWidget data={{ date, items: data.items.map((item) => ({ id: item.id, time: item.time ?? '09:00', title: item.label, done: item.done })) }} onChange={(next) => updateItems(next.items.map((item) => ({ id: item.id, label: item.title, done: item.done, due: next.date, time: item.time })))} />
      }
      if (mode === 'week') {
        const days = Array.from({ length: 7 }, (_, day) => data.items.filter((item) => (item.day ?? 0) === day).map((item) => ({ id: item.id, text: item.label, done: item.done })))
        return <WeeklyPlannerWidget data={{ days }} onChange={(next) => updateItems(next.days.flatMap((items, day) => items.map((item) => ({ id: item.id, label: item.text, done: item.done, day }))))} />
      }
      if (mode === 'timeline') {
        const phases = data.items.map((item, index) => ({ id: item.id, label: item.label, start: item.start ?? index, span: item.span ?? 1 }))
        const totalUnits = Math.max(4, ...phases.map((phase) => phase.start + phase.span))
        return <TimelineWidget data={{ totalUnits, phases }} />
      }
      if (mode === 'matrix') {
        return <PriorityMatrixWidget data={{ items: data.items.map((item) => ({ id: item.id, text: item.label, quadrant: item.quadrant ?? 0 })) }} onChange={(next) => updateItems(next.items.map((item) => ({ id: item.id, label: item.text, done: data.items.find((old) => old.id === item.id)?.done ?? false, quadrant: item.quadrant })))} />
      }
      return <ChecklistWidget data={data} onChange={(next) => updateItems(next.items)} onHeightChange={onHeightChange} />
    },
  },
}
