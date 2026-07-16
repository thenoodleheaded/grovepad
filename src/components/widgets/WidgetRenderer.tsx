import { lazy, Suspense, type ReactNode } from 'react'
import type { ModuleData, Widget } from '../../types/spatial'
import { getOpaqueWidgetType } from '../../utils/persistedBoardSchema'
import type {
  AtlasWidgetData,
  AiGeneratorData,
  AssignmentData,
  AudioPlayerData,
  BarChartData,
  BranchGateData,
  BudgetData,
  BulletsData,
  CalculatorData,
  CalendarData,
  CanvasNodeData,
  ChecklistData,
  CitationData,
  CodeData,
  ColorPaletteData,
  ContactData,
  CornellData,
  CounterData,
  CountdownData,
  DailyAgendaData,
  DatePickerData,
  DecisionData,
  DecisionMatrixData,
  DialogData,
  DividerData,
  FlashcardsData,
  FormWidgetData,
  FormulaData,
  FormulaSheetData,
  GameTunerData,
  GoalTrackerData,
  GpaData,
  GradeCalcData,
  HabitData,
  InventoryData,
  KanbanData,
  LineChartData,
  LinksData,
  LogbookData,
  MediaData,
  MeetingNotesData,
  MetricsData,
  MoodTrackerData,
  NotesData,
  NumberInputData,
  OutlineData,
  PieChartData,
  PollData,
  PomodoroData,
  PriorityMatrixData,
  ProcessData,
  ProgressData,
  ProsConsData,
  QuizData,
  QuoteData,
  RatingData,
  ReadingListData,
  RiskRegisterData,
  SketchpadData,
  StickyNoteData,
  StopwatchData,
  StudyGoalData,
  StatusData,
  SwotData,
  TableData,
  TextInputData,
  TimelineData,
  TimerData,
  TimesheetData,
  ToggleData,
  UnitConverterData,
  VocabData,
  WeeklyPlannerData,
  WorldClockData,
} from '../../types/spatial'
// Every module is split from the initial canvas bundle. React caches each
// resolved import, so a widget pays this cost only the first time its type is
// actually visible. This keeps a 73-type catalog from becoming startup cost.
const AiGeneratorWidget = lazy(async () => ({ default: (await import('./modules/AiGeneratorWidget')).AiGeneratorWidget }))
const BarChartWidget = lazy(async () => ({ default: (await import('./modules/BarChartWidget')).BarChartWidget }))
const BudgetWidget = lazy(async () => ({ default: (await import('./modules/BudgetWidget')).BudgetWidget }))
const BulletsWidget = lazy(async () => ({ default: (await import('./modules/BulletsWidget')).BulletsWidget }))
const CalculatorWidget = lazy(async () => ({ default: (await import('./modules/CalculatorWidget')).CalculatorWidget }))
const CalendarWidget = lazy(async () => ({ default: (await import('./modules/CalendarWidget')).CalendarWidget }))
const CanvasNodeWidget = lazy(async () => ({ default: (await import('./modules/CanvasNodeWidget')).CanvasNodeWidget }))
const ChecklistWidget = lazy(async () => ({ default: (await import('./modules/ChecklistWidget')).ChecklistWidget }))
const CodeWidget = lazy(async () => ({ default: (await import('./modules/CodeWidget')).CodeWidget }))
const ColorPaletteWidget = lazy(async () => ({ default: (await import('./modules/ColorPaletteWidget')).ColorPaletteWidget }))
const ContactWidget = lazy(async () => ({ default: (await import('./modules/ContactWidget')).ContactWidget }))
const CounterWidget = lazy(async () => ({ default: (await import('./modules/CounterWidget')).CounterWidget }))
const CountdownWidget = lazy(async () => ({ default: (await import('./modules/CountdownWidget')).CountdownWidget }))
const DecisionWidget = lazy(async () => ({ default: (await import('./modules/DecisionWidget')).DecisionWidget }))
const DialogWidget = lazy(async () => ({ default: (await import('./modules/DialogWidget')).DialogWidget }))
const DividerWidget = lazy(async () => ({ default: (await import('./modules/DividerWidget')).DividerWidget }))
const FlashcardsWidget = lazy(async () => ({ default: (await import('./modules/FlashcardsWidget')).FlashcardsWidget }))
const GoalTrackerWidget = lazy(async () => ({ default: (await import('./modules/GoalTrackerWidget')).GoalTrackerWidget }))
const HabitWidget = lazy(async () => ({ default: (await import('./modules/HabitWidget')).HabitWidget }))
const KanbanWidget = lazy(async () => ({ default: (await import('./modules/KanbanWidget')).KanbanWidget }))
const LinksWidget = lazy(async () => ({ default: (await import('./modules/LinksWidget')).LinksWidget }))
const MediaWidget = lazy(async () => ({ default: (await import('./modules/MediaWidget')).MediaWidget }))
const MeetingNotesWidget = lazy(async () => ({ default: (await import('./modules/MeetingNotesWidget')).MeetingNotesWidget }))
const MetricsWidget = lazy(async () => ({ default: (await import('./modules/MetricsWidget')).MetricsWidget }))
const MoodTrackerWidget = lazy(async () => ({ default: (await import('./modules/MoodTrackerWidget')).MoodTrackerWidget }))
const NotesWidget = lazy(async () => ({ default: (await import('./modules/NotesWidget')).NotesWidget }))
const PollWidget = lazy(async () => ({ default: (await import('./modules/PollWidget')).PollWidget }))
const PriorityMatrixWidget = lazy(async () => ({ default: (await import('./modules/PriorityMatrixWidget')).PriorityMatrixWidget }))
const ProgressWidget = lazy(async () => ({ default: (await import('./modules/ProgressWidget')).ProgressWidget }))
const ProsConsWidget = lazy(async () => ({ default: (await import('./modules/ProsConsWidget')).ProsConsWidget }))
const QuoteWidget = lazy(async () => ({ default: (await import('./modules/QuoteWidget')).QuoteWidget }))
const RatingWidget = lazy(async () => ({ default: (await import('./modules/RatingWidget')).RatingWidget }))
const ReadingListWidget = lazy(async () => ({ default: (await import('./modules/ReadingListWidget')).ReadingListWidget }))
const SketchpadWidget = lazy(async () => ({ default: (await import('./modules/SketchpadWidget')).SketchpadWidget }))
const StickyNoteWidget = lazy(async () => ({ default: (await import('./modules/StickyNoteWidget')).StickyNoteWidget }))
const StopwatchWidget = lazy(async () => ({ default: (await import('./modules/StopwatchWidget')).StopwatchWidget }))
const TableWidget = lazy(async () => ({ default: (await import('./modules/TableWidget')).TableWidget }))
const TimelineWidget = lazy(async () => ({ default: (await import('./modules/TimelineWidget')).TimelineWidget }))
const TimerWidget = lazy(async () => ({ default: (await import('./modules/TimerWidget')).TimerWidget }))
const WeeklyPlannerWidget = lazy(async () => ({ default: (await import('./modules/WeeklyPlannerWidget')).WeeklyPlannerWidget }))
const WorldClockWidget = lazy(async () => ({ default: (await import('./modules/WorldClockWidget')).WorldClockWidget }))
const PomodoroWidget = lazy(async () => ({ default: (await import('./modules/PomodoroWidget')).PomodoroWidget }))
const VocabWidget = lazy(async () => ({ default: (await import('./modules/VocabWidget')).VocabWidget }))
const GradeCalcWidget = lazy(async () => ({ default: (await import('./modules/GradeCalcWidget')).GradeCalcWidget }))
const GpaWidget = lazy(async () => ({ default: (await import('./modules/GpaWidget')).GpaWidget }))
const AssignmentWidget = lazy(async () => ({ default: (await import('./modules/AssignmentWidget')).AssignmentWidget }))
const CornellWidget = lazy(async () => ({ default: (await import('./modules/CornellWidget')).CornellWidget }))
const FormulaSheetWidget = lazy(async () => ({ default: (await import('./modules/FormulaSheetWidget')).FormulaSheetWidget }))
const CitationWidget = lazy(async () => ({ default: (await import('./modules/CitationWidget')).CitationWidget }))
const StudyGoalWidget = lazy(async () => ({ default: (await import('./modules/StudyGoalWidget')).StudyGoalWidget }))
const QuizWidget = lazy(async () => ({ default: (await import('./modules/QuizWidget')).QuizWidget }))
const AudioPlayerWidget = lazy(async () => ({ default: (await import('./modules/specialist/AudioPlayerWidget')).AudioPlayerWidget }))
const GameTunerWidget = lazy(async () => ({ default: (await import('./modules/specialist/GameTunerWidget')).GameTunerWidget }))

const loadEssentialWidgets = () => import('./modules/EssentialWidgets')
const TextInputWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).TextInputWidget }))
const NumberInputWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).NumberInputWidget }))
const ToggleWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).ToggleWidget }))
const BranchGateWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).BranchGateWidget }))
const FormulaWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).FormulaWidget }))
const StatusWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).StatusWidget }))
const DatePickerWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).DatePickerWidget }))
const OutlineWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).OutlineWidget }))
const FormWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).FormWidget }))
const DailyAgendaWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).DailyAgendaWidget }))
const ProcessWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).ProcessWidget }))
const RiskRegisterWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).RiskRegisterWidget }))
const DecisionMatrixWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).DecisionMatrixWidget }))
const SwotWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).SwotWidget }))
const TimesheetWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).TimesheetWidget }))
const InventoryWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).InventoryWidget }))
const LogbookWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).LogbookWidget }))
const LineChartWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).LineChartWidget }))
const PieChartWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).PieChartWidget }))
const UnitConverterWidget = lazy(async () => ({ default: (await loadEssentialWidgets()).UnitConverterWidget }))
const ExpansionWidget = lazy(async () => ({ default: (await import('./modules/ExpansionWidgets')).ExpansionWidget }))
const AtlasWidget = lazy(async () => ({ default: (await import('./modules/AtlasWidgets')).AtlasWidget }))
const AutomationCoreWidget = lazy(async () => ({ default: (await import('./modules/AutomationCoreWidgets')).AutomationCoreWidget }))
import { ATLAS_TYPE_SET, type AtlasType } from '../../widgets/atlasCatalog'
import { AUTOMATION_CORE_SET, type AutomationCoreType } from '../../widgets/automationCoreCatalog'
import type { AutomationCoreData } from '../../types/spatial'

interface WidgetRendererProps {
  widget: Widget
  onUpdate: (data: ModuleData) => void
  onHeightChange: (height: number) => void
}

function renderContent(
  widget: Widget,
  onUpdate: (data: ModuleData) => void,
  onHeightChange: (h: number) => void,
): ReactNode {
  if(ATLAS_TYPE_SET.has(widget.type))return <AtlasWidget type={widget.type as AtlasType} data={widget.data as AtlasWidgetData} onChange={onUpdate}/>
  if(AUTOMATION_CORE_SET.has(widget.type))return <AutomationCoreWidget widgetId={widget.id} type={widget.type as AutomationCoreType} data={widget.data as AutomationCoreData} onChange={onUpdate}/>
  switch (widget.type) {
    case 'notes':
      return (
        <NotesWidget
          data={widget.data as NotesData}
          onChange={onUpdate}
          onHeightChange={onHeightChange}
        />
      )
    case 'bullets':
      return <BulletsWidget data={widget.data as BulletsData} onChange={onUpdate} onHeightChange={onHeightChange} />
    case 'checklist':
      return <ChecklistWidget data={widget.data as ChecklistData} onChange={onUpdate} onHeightChange={onHeightChange} />
    case 'table':
      return <TableWidget data={widget.data as TableData} onChange={onUpdate} />
    case 'sketchpad':
      return <SketchpadWidget data={widget.data as SketchpadData} />
    case 'budget':
      return <BudgetWidget data={widget.data as BudgetData} onChange={onUpdate} />
    case 'progress':
      return <ProgressWidget data={widget.data as ProgressData} onChange={onUpdate} />
    case 'ai_generator':
      return (
        <AiGeneratorWidget
          data={widget.data as AiGeneratorData}
          widgetId={widget.id}
          onChange={onUpdate}
        />
      )
    case 'timeline':
      return <TimelineWidget data={widget.data as TimelineData} />
    case 'dialog':
      return <DialogWidget data={widget.data as DialogData} onChange={onUpdate} />
    case 'game_tuner':
      return <GameTunerWidget data={widget.data as GameTunerData} onChange={onUpdate} />
    case 'audio_player':
      return <AudioPlayerWidget data={widget.data as AudioPlayerData} onChange={onUpdate} />
    case 'canvas_node':
      return <CanvasNodeWidget data={widget.data as CanvasNodeData} />
    case 'kanban':
      return <KanbanWidget data={widget.data as KanbanData} onChange={onUpdate} />
    case 'countdown':
      return <CountdownWidget data={widget.data as CountdownData} onChange={onUpdate} />
    case 'habit':
      return <HabitWidget data={widget.data as HabitData} onChange={onUpdate} />
    case 'links':
      return <LinksWidget data={widget.data as LinksData} onChange={onUpdate} />
    case 'code':
      return <CodeWidget data={widget.data as CodeData} onChange={onUpdate} />
    case 'quote':
      return <QuoteWidget data={widget.data as QuoteData} onChange={onUpdate} />
    case 'poll':
      return <PollWidget data={widget.data as PollData} onChange={onUpdate} />
    case 'contact':
      return <ContactWidget data={widget.data as ContactData} onChange={onUpdate} />
    case 'media':
      return <MediaWidget data={widget.data as MediaData} onChange={onUpdate} />
    case 'metrics':
      return <MetricsWidget data={widget.data as MetricsData} onChange={onUpdate} />
    case 'divider':
      return <DividerWidget data={widget.data as DividerData} onChange={onUpdate} />
    case 'sticky_note':
      return <StickyNoteWidget data={widget.data as StickyNoteData} onChange={onUpdate} onHeightChange={onHeightChange} />
    case 'calendar':
      return <CalendarWidget data={widget.data as CalendarData} onChange={onUpdate} />
    case 'timer':
      return <TimerWidget data={widget.data as TimerData} onChange={onUpdate} />
    case 'rating':
      return <RatingWidget data={widget.data as RatingData} onChange={onUpdate} />
    case 'color_palette':
      return <ColorPaletteWidget data={widget.data as ColorPaletteData} onChange={onUpdate} />
    case 'mood_tracker':
      return <MoodTrackerWidget data={widget.data as MoodTrackerData} onChange={onUpdate} />
    case 'calculator':
      return <CalculatorWidget data={widget.data as CalculatorData} onChange={onUpdate} />
    case 'bar_chart':
      return <BarChartWidget data={widget.data as BarChartData} onChange={onUpdate} />
    case 'counter':
      return <CounterWidget data={widget.data as CounterData} onChange={onUpdate} />
    case 'pros_cons':
      return <ProsConsWidget data={widget.data as ProsConsData} onChange={onUpdate} />
    case 'weekly_planner':
      return <WeeklyPlannerWidget data={widget.data as WeeklyPlannerData} onChange={onUpdate} />
    case 'goal_tracker':
      return <GoalTrackerWidget data={widget.data as GoalTrackerData} onChange={onUpdate} />
    case 'stopwatch':
      return <StopwatchWidget data={widget.data as StopwatchData} onChange={onUpdate} />
    case 'reading_list':
      return <ReadingListWidget data={widget.data as ReadingListData} onChange={onUpdate} />
    case 'flashcards':
      return <FlashcardsWidget data={widget.data as FlashcardsData} onChange={onUpdate} />
    case 'meeting_notes':
      return <MeetingNotesWidget data={widget.data as MeetingNotesData} onChange={onUpdate} />
    case 'priority_matrix':
      return <PriorityMatrixWidget data={widget.data as PriorityMatrixData} onChange={onUpdate} />
    case 'decision':
      return <DecisionWidget data={widget.data as DecisionData} onChange={onUpdate} onHeightChange={onHeightChange} />
    case 'world_clock':
      return <WorldClockWidget data={widget.data as WorldClockData} onChange={onUpdate} />
    case 'pomodoro':
      return <PomodoroWidget data={widget.data as PomodoroData} onChange={onUpdate} />
    case 'vocab':
      return <VocabWidget data={widget.data as VocabData} onChange={onUpdate} />
    case 'grade_calc':
      return <GradeCalcWidget data={widget.data as GradeCalcData} onChange={onUpdate} />
    case 'gpa':
      return <GpaWidget data={widget.data as GpaData} onChange={onUpdate} />
    case 'assignment':
      return <AssignmentWidget data={widget.data as AssignmentData} onChange={onUpdate} />
    case 'cornell':
      return <CornellWidget data={widget.data as CornellData} onChange={onUpdate} />
    case 'formula_sheet':
      return <FormulaSheetWidget data={widget.data as FormulaSheetData} onChange={onUpdate} />
    case 'citation':
      return <CitationWidget data={widget.data as CitationData} onChange={onUpdate} />
    case 'study_goal':
      return <StudyGoalWidget data={widget.data as StudyGoalData} onChange={onUpdate} />
    case 'quiz':
      return <QuizWidget data={widget.data as QuizData} onChange={onUpdate} />
    case 'text_input':
      return <TextInputWidget data={widget.data as TextInputData} onChange={onUpdate} />
    case 'number_input':
      return <NumberInputWidget data={widget.data as NumberInputData} onChange={onUpdate} />
    case 'toggle':
      return <ToggleWidget data={widget.data as ToggleData} onChange={onUpdate} />
    case 'branch_gate':
      return <BranchGateWidget data={widget.data as BranchGateData} onChange={onUpdate} height={widget.size.height} onHeightChange={onHeightChange} />
    case 'formula':
      return <FormulaWidget data={widget.data as FormulaData} onChange={onUpdate} />
    case 'status':
      return <StatusWidget data={widget.data as StatusData} onChange={onUpdate} />
    case 'date_picker':
      return <DatePickerWidget data={widget.data as DatePickerData} onChange={onUpdate} />
    case 'outline':
      return <OutlineWidget data={widget.data as OutlineData} onChange={onUpdate} />
    case 'form':
      return <FormWidget data={widget.data as FormWidgetData} onChange={onUpdate} />
    case 'daily_agenda':
      return <DailyAgendaWidget data={widget.data as DailyAgendaData} onChange={onUpdate} />
    case 'process':
      return <ProcessWidget data={widget.data as ProcessData} onChange={onUpdate} />
    case 'risk_register':
      return <RiskRegisterWidget data={widget.data as RiskRegisterData} onChange={onUpdate} />
    case 'decision_matrix':
      return <DecisionMatrixWidget data={widget.data as DecisionMatrixData} onChange={onUpdate} />
    case 'swot':
      return <SwotWidget data={widget.data as SwotData} onChange={onUpdate} />
    case 'timesheet':
      return <TimesheetWidget data={widget.data as TimesheetData} onChange={onUpdate} />
    case 'inventory':
      return <InventoryWidget data={widget.data as InventoryData} onChange={onUpdate} />
    case 'logbook':
      return <LogbookWidget data={widget.data as LogbookData} onChange={onUpdate} />
    case 'line_chart':
      return <LineChartWidget data={widget.data as LineChartData} onChange={onUpdate} />
    case 'pie_chart':
      return <PieChartWidget data={widget.data as PieChartData} onChange={onUpdate} />
    case 'unit_converter':
      return <UnitConverterWidget data={widget.data as UnitConverterData} onChange={onUpdate} />
    case 'clock_pulse': case 'comparator': case 'aggregator': case 'range_mapper': case 'latch':
    case 'random_picker': case 'sequencer': case 'template': case 'recorder': case 'notifier':
    case 'subscriptions': case 'debt_payoff': case 'expense_split': case 'invoices':
    case 'meal_planner': case 'recipe': case 'home_maintenance': case 'chore_rotation':
    case 'renewals_vault': case 'medications': case 'workout_plan': case 'job_applications':
    case 'okr': case 'decision_journal': case 'weekly_review': case 'snippet_library':
    case 'keep_in_touch': case 'gifts_occasions': case 'trip_itinerary': case 'guest_list':
      return <ExpansionWidget type={widget.type} data={widget.data} onChange={onUpdate} />
    default:
      return null
  }
}

export function WidgetRenderer({ widget, onUpdate, onHeightChange }: WidgetRendererProps) {
  const opaqueType = getOpaqueWidgetType(widget)
  if (opaqueType) {
    return (
      <div
        aria-label={`Unsupported widget type ${opaqueType}`}
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-300/5 px-5 text-center"
        data-opaque-widget
        data-opaque-widget-type={opaqueType}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300/80">
          Newer Grovepad widget
        </span>
        <p className="max-w-72 text-sm leading-5 text-neutral-300">
          This card was made with a newer version of Grovepad. Its data is preserved unchanged.
        </p>
        <code className="max-w-full truncate rounded-md bg-black/20 px-2 py-1 text-[11px] text-neutral-400">
          {opaqueType}
        </code>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div data-widget-loading className="flex h-full w-full items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border border-neutral-700 border-t-neutral-300" />
        </div>
      }
    >
      <div className="gp-widget-ui h-full w-full" data-widget-type={widget.type}>
        {renderContent(widget, onUpdate, onHeightChange)}
      </div>
    </Suspense>
  )
}
