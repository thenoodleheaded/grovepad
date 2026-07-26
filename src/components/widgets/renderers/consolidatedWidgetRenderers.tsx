import type {
  BarChartData,
  ChecklistData,
  DecisionData,
  FlashcardsData,
  GoalTrackerData,
  NotesData,
  SketchpadData,
} from '../../../types/widgetDataCore'
import type { GradeCalcData } from '../../../types/widgetDataEducation'
import type { DatePickerData } from '../../../types/widgetDataWorkflow'
import type { ModuleData } from '../../../types/spatial'
import type { WidgetRendererFamily } from './contracts'
import {
  BarChartWidget,
  CountdownWidget,
  DecisionWidget,
  DrawingWidget,
  FlashcardsWidget,
  GoalTrackerWidget,
  NotesWidget,
  ProgressWidget,
  QuoteWidget,
  StickyNoteWidget,
  TasksWidget,
} from './lazyCoreWidgets'
import {
  GpaWidget,
  GradeCalcWidget,
  QuizWidget,
  StudyGoalWidget,
  VocabWidget,
} from './lazyEducationWidgets'
import { DatePickerWidget } from './lazyWorkflowWidgets'
import { ExpansionWidget } from './lazyCatalogWidgets'


const uid = () => crypto.randomUUID()

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
        return <QuoteWidget widgetId={widget.id} data={{ text: data.text, attribution: data.attribution ?? '' }} onChange={(next) => onUpdate({ ...data, text: next.text, attribution: next.attribution } as ModuleData)} onHeightChange={onHeightChange} />
      }
      return <NotesWidget widgetId={widget.id} skin={mode} data={data} onChange={onUpdate} onHeightChange={onHeightChange} />
    },

    bar_chart: ({ widget, onUpdate }) => {
      const data = widget.data as BarChartData
      return <BarChartWidget data={data} onChange={(next) => onUpdate(next as ModuleData)} />
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
      return (
        <DrawingWidget
          data={data}
          widgetId={widget.id}
          title={widget.title}
          onChange={(next) => onUpdate(next as ModuleData)}
        />
      )
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
      return (
        <TasksWidget
          data={data}
          onChange={onUpdate}
          onHeightChange={onHeightChange}
        />
      )
    },
  },
}
