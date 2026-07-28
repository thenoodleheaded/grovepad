import type {
  AiGeneratorData,
  AudioPlayerData,
  BudgetData,
  BulletsData,
  CalculatorData,
  CalendarData,
  CanvasNodeData,
  CodeData,
  ColorPaletteData,
  ContactData,
  CounterData,
  CountdownData,
  DialogData,
  ExcalidrawData,
  GameTunerData,
  HabitData,
  KanbanData,
  LinksData,
  MediaData,
  MeetingNotesData,
  MetricsData,
  MoodTrackerData,
  PollData,
  PriorityMatrixData,
  ProgressData,
  ProsConsData,
  QuoteData,
  RatingData,
  ReadingListData,
  StickyNoteData,
  StopwatchData,
  TableData,
  TimelineData,
  TimerData,
  WeeklyPlannerData,
  WorldClockData,
} from '../../../types/widgetDataCore'
import type { WidgetRendererFamily } from './contracts'
import {
  AiGeneratorWidget, AudioPlayerWidget, BudgetWidget, BulletsWidget,
  CalculatorWidget, CalendarWidget, CanvasNodeWidget, CodeWidget,
  ColorPaletteWidget, ContactWidget, CounterWidget, CountdownWidget,
  DialogWidget, ExcalidrawWidget, GameTunerWidget,
  HabitWidget, KanbanWidget, LinksWidget, MediaWidget, MeetingNotesWidget, MetricsWidget,
  MoodTrackerWidget, PollWidget, PriorityMatrixWidget, ProgressWidget,
  ProsConsWidget, QuoteWidget, RatingWidget, ReadingListWidget,
  StickyNoteWidget, StopwatchWidget, TableWidget, TimekeeperWidget, TimelineWidget, TimerWidget,
  WeeklyPlannerWidget, WorldClockWidget,
} from './lazyCoreWidgets'

export const coreWidgetRendererFamily: WidgetRendererFamily = {
  id: 'core',
  renderers: {
    bullets: ({ widget, onUpdate, onHeightChange }) => (
      <BulletsWidget
        data={widget.data as BulletsData}
        skin={(widget.data as BulletsData).skin}
        onChange={(data) => onUpdate(data)}
        onHeightChange={onHeightChange}
      />
    ),
    table: ({ widget, onUpdate }) => (
      <TableWidget
        data={widget.data as TableData}
        skin={(widget.data as TableData).skin}
        onChange={onUpdate}
      />
    ),
    excalidraw: ({ widget, onUpdate }) => (
      <ExcalidrawWidget data={widget.data as ExcalidrawData} widgetId={widget.id} title={widget.title} onChange={onUpdate} />
    ),
    budget: ({ widget, onUpdate }) => (
      <BudgetWidget
        data={widget.data as BudgetData}
        skin={(widget.data as BudgetData).skin}
        onChange={onUpdate}
      />
    ),
    progress: ({ widget, onUpdate }) => <ProgressWidget data={widget.data as ProgressData} onChange={onUpdate} />,
    ai_generator: ({ widget, onUpdate }) => <AiGeneratorWidget data={widget.data as AiGeneratorData} widgetId={widget.id} onChange={onUpdate} />,
    timeline: ({ widget }) => <TimelineWidget data={widget.data as TimelineData} />,
    dialog: ({ widget, onUpdate }) => (
      <DialogWidget
        data={widget.data as DialogData}
        skin={(widget.data as DialogData).skin}
        onChange={onUpdate}
      />
    ),
    game_tuner: ({ widget, onUpdate }) => <GameTunerWidget data={widget.data as GameTunerData} onChange={onUpdate} />,
    audio_player: ({ widget, onUpdate }) => <AudioPlayerWidget data={widget.data as AudioPlayerData} onChange={onUpdate} />,
    canvas_node: ({ widget, onUpdate, onHeightChange }) => (
      <CanvasNodeWidget
        data={widget.data as CanvasNodeData}
        skin={(widget.data as CanvasNodeData).skin}
        onChange={(data) => onUpdate(data)}
        onHeightChange={onHeightChange}
      />
    ),
    kanban: ({ widget, onUpdate }) => <KanbanWidget data={widget.data as KanbanData} onChange={onUpdate} />,
    countdown: ({ widget, onUpdate }) => <CountdownWidget data={widget.data as CountdownData} onChange={onUpdate} />,
    habit: ({ widget, onUpdate }) => (
      <HabitWidget
        data={widget.data as HabitData}
        skin={(widget.data as HabitData).skin}
        onChange={onUpdate}
      />
    ),
    links: ({ widget, onUpdate }) => <LinksWidget data={widget.data as LinksData} onChange={onUpdate} />,
    code: ({ widget, onUpdate }) => <CodeWidget data={widget.data as CodeData} onChange={onUpdate} />,
    quote: ({ widget, onUpdate }) => <QuoteWidget data={widget.data as QuoteData} onChange={onUpdate} />,
    poll: ({ widget, onUpdate, onHeightChange }) => (
      <PollWidget
        data={widget.data as PollData}
        onChange={onUpdate}
        onHeightChange={onHeightChange}
      />
    ),
    contact: ({ widget, onUpdate }) => <ContactWidget data={widget.data as ContactData} onChange={onUpdate} />,
    media: ({ widget, onUpdate }) => (
      <MediaWidget
        data={widget.data as MediaData}
        skin={(widget.data as MediaData).skin}
        onChange={onUpdate}
      />
    ),
    metrics: ({ widget, onUpdate }) => (
      <MetricsWidget
        data={widget.data as MetricsData}
        skin={(widget.data as MetricsData).skin}
        onChange={onUpdate}
      />
    ),
    sticky_note: ({ widget, onUpdate, onHeightChange }) => <StickyNoteWidget widgetId={widget.id} data={widget.data as StickyNoteData} onChange={onUpdate} onHeightChange={onHeightChange} />,
    calendar: ({ widget, onUpdate }) => (
      <CalendarWidget
        data={widget.data as CalendarData}
        skin={(widget.data as CalendarData).skin}
        onChange={onUpdate}
      />
    ),
    timer: ({ widget, onUpdate }) => <TimerWidget data={widget.data as TimerData} onChange={onUpdate} />,
    timekeeper: ({ widget, onUpdate }) => <TimekeeperWidget data={widget.data as import('../../../types/widgetDataExpansion').TimekeeperData} onChange={onUpdate} />,
    rating: ({ widget, onUpdate }) => (
      <RatingWidget
        data={widget.data as RatingData}
        skin={(widget.data as RatingData).skin}
        onChange={onUpdate}
      />
    ),
    color_palette: ({ widget, onUpdate }) => <ColorPaletteWidget data={widget.data as ColorPaletteData} onChange={onUpdate} />,
    mood_tracker: ({ widget, onUpdate }) => <MoodTrackerWidget data={widget.data as MoodTrackerData} onChange={onUpdate} />,
    calculator: ({ widget, onUpdate }) => (
      <CalculatorWidget
        data={widget.data as CalculatorData}
        skin={(widget.data as CalculatorData).skin}
        onChange={onUpdate}
      />
    ),
    counter: ({ widget, onUpdate }) => <CounterWidget data={widget.data as CounterData} onChange={onUpdate} />,
    pros_cons: ({ widget, onUpdate }) => <ProsConsWidget data={widget.data as ProsConsData} onChange={onUpdate} />,
    weekly_planner: ({ widget, onUpdate }) => <WeeklyPlannerWidget data={widget.data as WeeklyPlannerData} onChange={onUpdate} />,
    stopwatch: ({ widget, onUpdate }) => <StopwatchWidget data={widget.data as StopwatchData} onChange={onUpdate} />,
    reading_list: ({ widget, onUpdate }) => <ReadingListWidget data={widget.data as ReadingListData} onChange={onUpdate} />,
    meeting_notes: ({ widget, onUpdate, onHeightChange }) => (
      <MeetingNotesWidget
        data={widget.data as MeetingNotesData}
        onChange={onUpdate}
        onHeightChange={onHeightChange}
      />
    ),
    priority_matrix: ({ widget, onUpdate }) => <PriorityMatrixWidget data={widget.data as PriorityMatrixData} onChange={onUpdate} />,
    world_clock: ({ widget, onUpdate }) => <WorldClockWidget data={widget.data as WorldClockData} onChange={onUpdate} />,
  },
}
