import { lazy } from 'react'

export const AiGeneratorWidget = lazy(async () => ({ default: (await import('../modules/AiGeneratorWidget')).AiGeneratorWidget }))
export const AudioPlayerWidget = lazy(async () => ({ default: (await import('../modules/specialist/AudioPlayerWidget')).AudioPlayerWidget }))
export const BarChartWidget = lazy(async () => ({ default: (await import('../modules/BarChartWidget')).BarChartWidget }))
export const BudgetWidget = lazy(async () => ({ default: (await import('../modules/BudgetWidget')).BudgetWidget }))
export const BulletsWidget = lazy(async () => ({ default: (await import('../modules/BulletsWidget')).BulletsWidget }))
export const CalculatorWidget = lazy(async () => ({ default: (await import('../modules/CalculatorWidget')).CalculatorWidget }))
export const CalendarWidget = lazy(async () => ({ default: (await import('../modules/CalendarWidget')).CalendarWidget }))
export const CanvasNodeWidget = lazy(async () => ({ default: (await import('../modules/CanvasNodeWidget')).CanvasNodeWidget }))
export const ChecklistWidget = lazy(async () => ({ default: (await import('../modules/ChecklistWidget')).ChecklistWidget }))
export const CodeWidget = lazy(async () => ({ default: (await import('../modules/CodeWidget')).CodeWidget }))
export const ColorPaletteWidget = lazy(async () => ({ default: (await import('../modules/ColorPaletteWidget')).ColorPaletteWidget }))
export const ContactWidget = lazy(async () => ({ default: (await import('../modules/ContactWidget')).ContactWidget }))
export const CounterWidget = lazy(async () => ({ default: (await import('../modules/CounterWidget')).CounterWidget }))
export const CountdownWidget = lazy(async () => ({ default: (await import('../modules/CountdownWidget')).CountdownWidget }))
export const DecisionWidget = lazy(async () => ({ default: (await import('../modules/DecisionWidget')).DecisionWidget }))
export const DialogWidget = lazy(async () => ({ default: (await import('../modules/DialogWidget')).DialogWidget }))
export const ExcalidrawWidget = lazy(async () => ({ default: (await import('../modules/excalidraw/ExcalidrawWidget')).ExcalidrawWidget }))
export const FlashcardsWidget = lazy(async () => ({ default: (await import('../modules/FlashcardsWidget')).FlashcardsWidget }))
export const GameTunerWidget = lazy(async () => ({ default: (await import('../modules/specialist/GameTunerWidget')).GameTunerWidget }))
export const GoalTrackerWidget = lazy(async () => ({ default: (await import('../modules/GoalTrackerWidget')).GoalTrackerWidget }))
export const HabitWidget = lazy(async () => ({ default: (await import('../modules/HabitWidget')).HabitWidget }))
export const KanbanWidget = lazy(async () => ({ default: (await import('../modules/KanbanWidget')).KanbanWidget }))
export const LinksWidget = lazy(async () => ({ default: (await import('../modules/LinksWidget')).LinksWidget }))
export const MediaWidget = lazy(async () => ({ default: (await import('../modules/MediaWidget')).MediaWidget }))
export const MeetingNotesWidget = lazy(async () => ({ default: (await import('../modules/MeetingNotesWidget')).MeetingNotesWidget }))
export const MetricsWidget = lazy(async () => ({ default: (await import('../modules/MetricsWidget')).MetricsWidget }))
export const MoodTrackerWidget = lazy(async () => ({ default: (await import('../modules/MoodTrackerWidget')).MoodTrackerWidget }))
export const NotesWidget = lazy(async () => ({ default: (await import('../modules/NotesWidget')).NotesWidget }))
export const PollWidget = lazy(async () => ({ default: (await import('../modules/PollWidget')).PollWidget }))
export const PriorityMatrixWidget = lazy(async () => ({ default: (await import('../modules/PriorityMatrixWidget')).PriorityMatrixWidget }))
export const ProgressWidget = lazy(async () => ({ default: (await import('../modules/ProgressWidget')).ProgressWidget }))
export const ProsConsWidget = lazy(async () => ({ default: (await import('../modules/ProsConsWidget')).ProsConsWidget }))
export const QuoteWidget = lazy(async () => ({ default: (await import('../modules/QuoteWidget')).QuoteWidget }))
export const RatingWidget = lazy(async () => ({ default: (await import('../modules/RatingWidget')).RatingWidget }))
export const ReadingListWidget = lazy(async () => ({ default: (await import('../modules/ReadingListWidget')).ReadingListWidget }))
export const SketchpadWidget = lazy(async () => ({ default: (await import('../modules/SketchpadWidget')).SketchpadWidget }))
export const StickyNoteWidget = lazy(async () => ({ default: (await import('../modules/StickyNoteWidget')).StickyNoteWidget }))
export const StopwatchWidget = lazy(async () => ({ default: (await import('../modules/StopwatchWidget')).StopwatchWidget }))
export const TableWidget = lazy(async () => ({ default: (await import('../modules/TableWidget')).TableWidget }))
export const TimelineWidget = lazy(async () => ({ default: (await import('../modules/TimelineWidget')).TimelineWidget }))
export const TimerWidget = lazy(async () => ({ default: (await import('../modules/TimerWidget')).TimerWidget }))
export const TimekeeperWidget = lazy(async () => ({ default: (await import('../modules/TimekeeperWidget')).TimekeeperWidget }))
export const WeeklyPlannerWidget = lazy(async () => ({ default: (await import('../modules/WeeklyPlannerWidget')).WeeklyPlannerWidget }))
export const WorldClockWidget = lazy(async () => ({ default: (await import('../modules/WorldClockWidget')).WorldClockWidget }))

/** Same import literals as the lazy() wrappers above — Vite resolves them
 * to the same chunks, so firing one warms the exact module a first mount
 * would need. Consumed by the idle prefetch runtime (engine/loader). */
export const CORE_WIDGET_MODULE_LOADERS: ReadonlyArray<() => Promise<unknown>> = [
  () => import('../modules/AiGeneratorWidget'),
  () => import('../modules/BarChartWidget'),
  () => import('../modules/BudgetWidget'),
  () => import('../modules/BulletsWidget'),
  () => import('../modules/CalculatorWidget'),
  () => import('../modules/CalendarWidget'),
  () => import('../modules/CanvasNodeWidget'),
  () => import('../modules/ChecklistWidget'),
  () => import('../modules/CodeWidget'),
  () => import('../modules/ColorPaletteWidget'),
  () => import('../modules/ContactWidget'),
  () => import('../modules/CountdownWidget'),
  () => import('../modules/CounterWidget'),
  () => import('../modules/DecisionWidget'),
  () => import('../modules/DialogWidget'),
  () => import('../modules/FlashcardsWidget'),
  () => import('../modules/GoalTrackerWidget'),
  () => import('../modules/HabitWidget'),
  () => import('../modules/KanbanWidget'),
  () => import('../modules/LinksWidget'),
  () => import('../modules/MediaWidget'),
  () => import('../modules/MeetingNotesWidget'),
  () => import('../modules/MetricsWidget'),
  () => import('../modules/MoodTrackerWidget'),
  () => import('../modules/NotesWidget'),
  () => import('../modules/PollWidget'),
  () => import('../modules/PriorityMatrixWidget'),
  () => import('../modules/ProgressWidget'),
  () => import('../modules/ProsConsWidget'),
  () => import('../modules/QuoteWidget'),
  () => import('../modules/RatingWidget'),
  () => import('../modules/ReadingListWidget'),
  () => import('../modules/SketchpadWidget'),
  () => import('../modules/StickyNoteWidget'),
  () => import('../modules/StopwatchWidget'),
  () => import('../modules/TableWidget'),
  () => import('../modules/TimekeeperWidget'),
  () => import('../modules/TimelineWidget'),
  () => import('../modules/TimerWidget'),
  () => import('../modules/WeeklyPlannerWidget'),
  () => import('../modules/WorldClockWidget'),
  () => import('../modules/excalidraw/ExcalidrawWidget'),
  () => import('../modules/specialist/AudioPlayerWidget'),
  () => import('../modules/specialist/GameTunerWidget'),
]
