import type {
  AssignmentData,
  CitationData,
  CornellData,
  FormulaSheetData,
  GpaData,
  GradeCalcData,
  PomodoroData,
  QuizData,
  StudyGoalData,
  VocabData,
} from '../../../types/widgetDataEducation'
import type { WidgetRendererFamily } from './contracts'
import {
  AssignmentWidget, CitationWidget, CornellWidget, FormulaSheetWidget, GpaWidget,
  GradeCalcWidget, PomodoroWidget, QuizWidget, StudyGoalWidget, VocabWidget,
} from './lazyEducationWidgets'

export const educationWidgetRendererFamily: WidgetRendererFamily = {
  id: 'education',
  renderers: {
    pomodoro: ({ widget, onUpdate }) => <PomodoroWidget data={widget.data as PomodoroData} onChange={onUpdate} />,
    vocab: ({ widget, onUpdate }) => <VocabWidget data={widget.data as VocabData} onChange={onUpdate} />,
    grade_calc: ({ widget, onUpdate }) => <GradeCalcWidget data={widget.data as GradeCalcData} onChange={onUpdate} />,
    gpa: ({ widget, onUpdate }) => <GpaWidget data={widget.data as GpaData} onChange={onUpdate} />,
    assignment: ({ widget, onUpdate }) => <AssignmentWidget data={widget.data as AssignmentData} onChange={onUpdate} />,
    cornell: ({ widget, onUpdate }) => <CornellWidget data={widget.data as CornellData} onChange={onUpdate} />,
    formula_sheet: ({ widget, onUpdate }) => <FormulaSheetWidget data={widget.data as FormulaSheetData} onChange={onUpdate} />,
    citation: ({ widget, onUpdate }) => <CitationWidget data={widget.data as CitationData} onChange={onUpdate} />,
    study_goal: ({ widget, onUpdate }) => <StudyGoalWidget data={widget.data as StudyGoalData} onChange={onUpdate} />,
    quiz: ({ widget, onUpdate }) => <QuizWidget data={widget.data as QuizData} onChange={onUpdate} />,
  },
}
