import type { ModuleType,
  AiGeneratorData,
  AudioPlayerData,
  BarChartData,
  BulletsData,
  CalculatorData,
  CalendarData,
  CodeData,
  ColorPaletteData,
  ContactData,
  DecisionData,
  DialogData,
  FlashcardsData,
  GameTunerData,
  KanbanData,
  LinksData,
  MediaData,
  MeetingNotesData,
  MetricsData,
  MoodTrackerData,
  PriorityMatrixData,
  ProsConsData,
  ReadingListData,
  TableData,
  TimelineData,
  WeeklyPlannerData,
} from '../../types/spatial'
import type { FieldDescriptor } from '../contracts/fields'
import { localDayKey } from '../../utils/localDate'
import { num, text } from './valueHelpers'

/** Data, board, and media widget fields (bar_chart … audio_player). Extracted verbatim from fields.ts; field order IS port-slot order — never reorder within an entry. */
export const DATA_MEDIA_FIELDS = {
  bar_chart: [
    {
      key: 'total',
      label: 'Total',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as BarChartData).bars.reduce((s, b) => s + (Number.isFinite(b.value) ? b.value : 0), 0),
    },
    {
      key: 'series',
      label: 'Series',
      valueType: 'series',
      get: (d) => (d as BarChartData).bars.map((point, index) => ({ t: index, v: point.value })),
      set: (d, v) => Array.isArray(v) ? ({
        ...(d as BarChartData),
        bars: v.slice(-400).map((point, index) => ({
          id: (d as BarChartData).bars[index]?.id ?? crypto.randomUUID(),
          label: (d as BarChartData).bars[index]?.label ?? String(index + 1),
          color: (d as BarChartData).bars[index]?.color,
          value: point.v,
        })),
      }) : d,
    },
    {
      key: 'latest',
      label: 'Latest value',
      valueType: 'number',
      get: (d) => (d as BarChartData).bars.at(-1)?.value ?? 0,
    },
    {
      key: 'average',
      label: 'Average',
      valueType: 'number',
      get: (d) => {
        const points = (d as BarChartData).bars
        return points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : 0
      },
    },
  ],
  calculator: [
    {
      key: 'result',
      label: 'Result',
      valueType: 'number',
      get: (d) => num((d as CalculatorData).result),
    },
  ],
  weekly_planner: [
    {
      key: 'done_count',
      label: 'Done count',
      valueType: 'number',
      unit: 'count',
      get: (d) =>
        (d as WeeklyPlannerData).days.reduce((s, day) => s + day.filter((t) => t.done).length, 0),
    },
  ],
  meeting_notes: [
    {
      key: 'actions_done',
      label: 'Actions done',
      valueType: 'boolean',
      get: (d) => {
        const actions = (d as MeetingNotesData).actions
        return actions.length > 0 && actions.every((a) => a.done)
      },
    },
  ],
  pros_cons: [
    {
      key: 'pros_count',
      label: 'Pros',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ProsConsData).pros.filter((p) => p.text.trim()).length,
    },
    {
      key: 'cons_count',
      label: 'Cons',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ProsConsData).cons.filter((c) => c.text.trim()).length,
    },
  ],
  decision: [
    {
      key: 'picked',
      label: 'Picked option',
      valueType: 'text',
      get: (d) => {
        const dd = d as DecisionData
        return dd.pickedIndex !== null ? (dd.options[dd.pickedIndex] ?? '') : ''
      },
    },
  ],
  bullets: [
    {
      key: 'count',
      label: 'Items',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as BulletsData).items.filter((item) => item.text.trim()).length,
    },
  ],
  table: [
    {
      key: 'row_count',
      label: 'Rows',
      valueType: 'number',
      unit: 'count',
      get: (d) => Math.max(0, (d as TableData).rows.length - 1),
    },
  ],
  kanban: [
    {
      key: 'total_cards',
      label: 'Total cards',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as KanbanData).columns.reduce((s, c) => s + c.cards.length, 0),
    },
    {
      key: 'done_count',
      label: 'Last column',
      valueType: 'number',
      unit: 'count',
      get: (d) => {
        const cols = (d as KanbanData).columns
        return cols[cols.length - 1]?.cards.length ?? 0
      },
    },
  ],
  links: [
    {
      key: 'count',
      label: 'Links',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as LinksData).items.filter((i) => i.url.trim() || i.label.trim()).length,
    },
  ],
  code: [
    {
      key: 'code',
      label: 'Code',
      valueType: 'text',
      get: (d) => (d as CodeData).code,
      set: (d, v) => ({ ...(d as CodeData), code: text(v) }),
    },
  ],
  contact: [
    {
      key: 'name',
      label: 'Name',
      valueType: 'text',
      get: (d) => (d as ContactData).name,
      set: (d, v) => ({ ...(d as ContactData), name: text(v) }),
    },
    {
      key: 'email',
      label: 'Email',
      valueType: 'text',
      get: (d) => (d as ContactData).email,
      set: (d, v) => ({ ...(d as ContactData), email: text(v) }),
    },
  ],
  media: [
    {
      key: 'url',
      label: 'Image URL',
      valueType: 'text',
      get: (d) => (d as MediaData).url,
      set: (d, v) => ({ ...(d as MediaData), url: text(v) }),
    },
    {
      key: 'caption',
      label: 'Caption',
      valueType: 'text',
      get: (d) => (d as MediaData).caption,
      set: (d, v) => ({ ...(d as MediaData), caption: text(v) }),
    },
  ],
  metrics: [
    {
      key: 'value_1',
      label: 'Tile 1 value',
      valueType: 'number',
      get: (d) => {
        const first = (d as MetricsData).tiles[0]
        return first ? num(first.value) : 0
      },
      set: (d, v) => {
        const md = d as MetricsData
        const first = md.tiles[0]
        if (!first) return md
        return {
          tiles: md.tiles.map((t, i) => (i === 0 ? { ...t, value: String(num(v)) } : t)),
        }
      },
    },
  ],
  dialog: [
    {
      key: 'line_count',
      label: 'Lines',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as DialogData).lines.length,
    },
  ],
  calendar: [
    {
      key: 'marked_count',
      label: 'Marked days',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as CalendarData).markedDates.length,
    },
    {
      key: 'today',
      label: 'Today',
      valueType: 'text',
      unit: 'date_iso',
      get: () => localDayKey(),
      timeSensitive: true,
    },
  ],
  color_palette: [
    {
      key: 'count',
      label: 'Swatches',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ColorPaletteData).colors.length,
    },
  ],
  mood_tracker: [
    {
      key: 'logged_count',
      label: 'Days logged',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as MoodTrackerData).days.filter((day) => day !== null).length,
    },
  ],
  reading_list: [
    {
      key: 'done_count',
      label: 'Read',
      valueType: 'number',
      unit: 'count',
      get: (d) => (d as ReadingListData).items.filter((i) => i.status === 'done').length,
    },
  ],
  flashcards: [
    {
      key: 'card_count',
      label: 'Cards',
      valueType: 'number',
      unit: 'count',
      get: (d) => {
        const deck = d as FlashcardsData
        if (deck.mode === 'vocabulary') return deck.vocabulary?.terms.length ?? 0
        if (deck.mode === 'quiz') return deck.quiz?.options.length ?? 0
        return deck.cards.length
      },
    },
  ],
  priority_matrix: [
    {
      key: 'do_first_count',
      label: 'Do-first items',
      valueType: 'number',
      get: (d) => (d as PriorityMatrixData).items.filter((i) => i.quadrant === 0).length,
    },
  ],
  timeline: [
    {
      key: 'total_units',
      label: 'Total units',
      valueType: 'number',
      get: (d) => (d as TimelineData).totalUnits,
      set: (d, v) => ({
        ...(d as TimelineData),
        totalUnits: Math.max(1, Math.round(num(v))),
      }),
    },
  ],
  ai_generator: [
    {
      key: 'prompt',
      label: 'Prompt',
      valueType: 'text',
      get: (d) => (d as AiGeneratorData).prompt,
      set: (d, v) => ({ ...(d as AiGeneratorData), prompt: text(v), status: 'idle' as const }),
    },
    {
      key: 'done',
      label: 'Generated',
      valueType: 'boolean',
      get: (d) => (d as AiGeneratorData).status === 'done',
    },
  ],
  game_tuner: [
    {
      key: 'grip',
      label: 'Grip',
      valueType: 'number',
      get: (d) => (d as GameTunerData).grip,
      set: (d, v) => ({
        ...(d as GameTunerData),
        grip: Math.min(100, Math.max(0, Math.round(num(v)))),
      }),
    },
    {
      key: 'drift',
      label: 'Drift',
      valueType: 'number',
      get: (d) => (d as GameTunerData).drift,
      set: (d, v) => ({
        ...(d as GameTunerData),
        drift: Math.min(90, Math.max(0, Math.round(num(v)))),
      }),
    },
    {
      key: 'stability',
      label: 'Stability',
      valueType: 'number',
      get: (d) => (d as GameTunerData).stability,
      set: (d, v) => ({
        ...(d as GameTunerData),
        stability: Math.min(100, Math.max(0, Math.round(num(v)))),
      }),
    },
  ],
  audio_player: [
    {
      key: 'bpm',
      label: 'BPM',
      valueType: 'number',
      get: (d) => (d as AudioPlayerData).bpm,
      set: (d, v) => ({
        ...(d as AudioPlayerData),
        bpm: Math.min(250, Math.max(40, Math.round(num(v)))),
      }),
    },
    {
      key: 'playing',
      label: 'Playing',
      valueType: 'boolean',
      get: (d) => (d as AudioPlayerData).isPlaying,
      set: (d, v) => ({
        ...(d as AudioPlayerData),
        isPlaying: typeof v === 'boolean' ? v : num(v) >= 1,
      }),
    },
  ],
} satisfies Partial<Record<ModuleType, FieldDescriptor[]>>
