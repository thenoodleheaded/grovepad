import { lazy } from 'react'

export const AiGeneratorWidget = lazy(async () => ({ default: (await import('../modules/AiGeneratorWidget')).AiGeneratorWidget }))
export const AudioPlayerWidget = lazy(async () => ({ default: (await import('../modules/specialist/AudioPlayerWidget')).AudioPlayerWidget }))
export const BarChartWidget = lazy(async () => ({ default: (await import('../modules/BarChartWidget')).BarChartWidget }))
export const BudgetWidget = lazy(async () => ({ default: (await import('../modules/BudgetWidget')).BudgetWidget }))
export const BulletsWidget = lazy(async () => ({ default: (await import('../modules/BulletsWidget')).BulletsWidget }))
export const CalculatorWidget = lazy(async () => ({ default: (await import('../modules/CalculatorWidget')).CalculatorWidget }))
export const CalendarWidget = lazy(async () => ({ default: (await import('../modules/CalendarWidget')).CalendarWidget }))
export const CanvasNodeWidget = lazy(async () => ({ default: (await import('../modules/CanvasNodeWidget')).CanvasNodeWidget }))
export const CodeWidget = lazy(async () => ({ default: (await import('../modules/CodeWidget')).CodeWidget }))
export const ColorPaletteWidget = lazy(async () => ({ default: (await import('../modules/ColorPaletteWidget')).ColorPaletteWidget }))
export const ContactWidget = lazy(async () => ({ default: (await import('../modules/ContactWidget')).ContactWidget }))
export const CounterWidget = lazy(async () => ({ default: (await import('../modules/CounterWidget')).CounterWidget }))
export const DecisionWidget = lazy(async () => ({ default: (await import('../modules/DecisionWidget')).DecisionWidget }))
export const DialogWidget = lazy(async () => ({ default: (await import('../modules/DialogWidget')).DialogWidget }))
export const DrawingWidget = lazy(async () => ({ default: (await import('../modules/DrawingWidget')).DrawingWidget }))
export const FlashcardsWidget = lazy(async () => ({ default: (await import('../modules/FlashcardsWidget')).FlashcardsWidget }))
export const GameTunerWidget = lazy(async () => ({ default: (await import('../modules/specialist/GameTunerWidget')).GameTunerWidget }))
export const GoalTrackerWidget = lazy(async () => ({ default: (await import('../modules/GoalTrackerWidget')).GoalTrackerWidget }))
export const HabitWidget = lazy(async () => ({ default: (await import('../modules/HabitWidget')).HabitWidget }))
export const LinksWidget = lazy(async () => ({ default: (await import('../modules/LinksWidget')).LinksWidget }))
export const MediaWidget = lazy(async () => ({ default: (await import('../modules/MediaWidget')).MediaWidget }))
export const MeetingNotesWidget = lazy(async () => ({ default: (await import('../modules/MeetingNotesWidget')).MeetingNotesWidget }))
export const MetricsWidget = lazy(async () => ({ default: (await import('../modules/MetricsWidget')).MetricsWidget }))
export const MoodTrackerWidget = lazy(async () => ({ default: (await import('../modules/MoodTrackerWidget')).MoodTrackerWidget }))
export const PollWidget = lazy(async () => ({ default: (await import('../modules/PollWidget')).PollWidget }))
export const ProgressWidget = lazy(async () => ({ default: (await import('../modules/ProgressWidget')).ProgressWidget }))
export const ProsConsWidget = lazy(async () => ({ default: (await import('../modules/ProsConsWidget')).ProsConsWidget }))
export const RatingWidget = lazy(async () => ({ default: (await import('../modules/RatingWidget')).RatingWidget }))
export const ReadingListWidget = lazy(async () => ({ default: (await import('../modules/ReadingListWidget')).ReadingListWidget }))
export const StickyNoteWidget = lazy(async () => ({ default: (await import('../modules/StickyNoteWidget')).StickyNoteWidget }))
export const TableWidget = lazy(async () => ({ default: (await import('../modules/TableWidget')).TableWidget }))
export const TasksWidget = lazy(async () => ({ default: (await import('../modules/TasksWidget')).TasksWidget }))
export const TextWidget = lazy(async () => ({ default: (await import('../modules/TextWidget')).TextWidget }))
export const TimekeeperWidget = lazy(async () => ({ default: (await import('../modules/TimekeeperWidget')).TimekeeperWidget }))

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
  () => import('../modules/CodeWidget'),
  () => import('../modules/ColorPaletteWidget'),
  () => import('../modules/ContactWidget'),
  () => import('../modules/CountdownWidget'),
  () => import('../modules/CounterWidget'),
  () => import('../modules/DecisionWidget'),
  () => import('../modules/DialogWidget'),
  () => import('../modules/DrawingWidget'),
  () => import('../modules/FlashcardsWidget'),
  () => import('../modules/GoalTrackerWidget'),
  () => import('../modules/HabitWidget'),
  () => import('../modules/LinksWidget'),
  () => import('../modules/MediaWidget'),
  () => import('../modules/MeetingNotesWidget'),
  () => import('../modules/MetricsWidget'),
  () => import('../modules/MoodTrackerWidget'),
  () => import('../modules/PollWidget'),
  () => import('../modules/ProgressWidget'),
  () => import('../modules/ProsConsWidget'),
  () => import('../modules/RatingWidget'),
  () => import('../modules/ReadingListWidget'),
  () => import('../modules/SketchpadWidget'),
  () => import('../modules/StickyNoteWidget'),
  () => import('../modules/StopwatchWidget'),
  () => import('../modules/TableWidget'),
  () => import('../modules/TasksWidget'),
  () => import('../modules/TextWidget'),
  () => import('../modules/TimekeeperWidget'),
  () => import('../modules/TimerWidget'),
  () => import('../modules/WorldClockWidget'),
  () => import('../modules/excalidraw/ExcalidrawWidget'),
  () => import('../modules/specialist/AudioPlayerWidget'),
  () => import('../modules/specialist/GameTunerWidget'),
]
