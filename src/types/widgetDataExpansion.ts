export type UnitConverterCategory = 'length' | 'mass' | 'temperature' | 'time'

export interface UnitConverterData {
  category: UnitConverterCategory
  value: number
  from: string
  to: string
  precision: number
}

export interface SeriesPoint { t: number; v: number }
export interface ClockPulseData { label: string; mode: 'daily'|'weekly'|'interval'|'window'; time: string; days: number[]; intervalMinutes: number; windowStart: string; windowEnd: string; lastFiredAt: number | null }
export interface ComparatorData { label: string; op: 'gt'|'gte'|'lt'|'lte'|'eq'|'between'; a: number; b: number; low: number; high: number }
export interface AggregatorData { label: string; mode: 'avg'|'min'|'max'|'count_nonzero'|'count_true'; slots: number[] }
interface RangeBand { id: string; upTo: number; label: string; emoji?: string }
export interface RangeMapperData { label: string; input: number; bands: RangeBand[] }
export interface LatchData { label: string; current: number; held: number; heldAt: number | null }
interface RandomPickerOption { id: string; text: string; weight: number }
export interface RandomPickerData { label: string; options: RandomPickerOption[]; pick: string; history: string[]; lastRolledAt: number | null; noRepeatWindow: number }
interface SequencerStep { id: string; text: string }
export interface SequencerData { label: string; steps: SequencerStep[]; activeIndex: number; loop: boolean }
export interface TemplateData { template: string; slotA: string; slotB: string; slotC: string; slotD: string }
export interface RecorderData { label: string; input: number; samples: SeriesPoint[]; mode: 'on_change'|'daily'|'on_command'; lastRecordedAt: number | null }
export interface NotifierData { label: string; message: string; channel: 'toast'|'browser'; cooldownMinutes: number; armed: boolean; lastFiredAt: number | null; fireCount: number; pendingFireAt: number | null }

interface SubscriptionRow { id: string; name: string; cost: number; cycle: 'monthly'|'yearly'|'weekly'; renewsOn: string; active: boolean }
export interface SubscriptionsData { rows: SubscriptionRow[] }
interface DebtRow { id: string; name: string; balance: number; apr: number; minPayment: number }
export interface DebtPayoffData { debts: DebtRow[]; extraPayment: number; strategy: 'snowball'|'avalanche' }
interface SplitExpense { id: string; desc: string; amount: number; paidBy: string; splitAmong: string[] }
export interface ExpenseSplitData { people: string[]; you: string; expenses: SplitExpense[] }
interface InvoiceRow { id: string; client: string; amount: number; issued: string; due: string; status: 'draft'|'sent'|'paid' }
export interface InvoicesData { rows: InvoiceRow[] }
interface MealSlot { id: string; day: number; meal: 'breakfast'|'lunch'|'dinner'; dish: string; recipeWidgetId?: string }
export interface MealPlannerData { week: MealSlot[]; shoppingList: string }
interface RecipeIngredient { id: string; qty: number; unit: string; item: string }
interface RecipeStep { id: string; text: string; done: boolean }
export interface RecipeData { title: string; servings: number; baseServings: number; ingredients: RecipeIngredient[]; steps: RecipeStep[]; cookMinutes: number }
interface MaintenanceRow { id: string; task: string; everyMonths: number; lastDone: string }
export interface HomeMaintenanceData { rows: MaintenanceRow[] }
export interface ChoreRotationData { people: string[]; chores: string[]; offset: number; cadenceLabel: string }
interface RenewalRow { id: string; item: string; expires: string; noteRef: string; renewLeadDays: number }
export interface RenewalsVaultData { rows: RenewalRow[] }
interface MedicationRow { id: string; name: string; timesPerDay: number; takenToday: boolean[]; pillsLeft: number; dailyUse: number }
export interface MedicationsData { rows: MedicationRow[] }
interface WorkoutExercise { id: string; name: string; sets: number; reps: number; weight: number; done: boolean }
interface WorkoutDay { id: string; label: string; exercises: WorkoutExercise[] }
export interface WorkoutPlanData { days: WorkoutDay[]; activeDay: number; lastSession: string }
interface JobApplicationRow { id: string; company: string; role: string; stage: 'wishlist'|'applied'|'screen'|'interview'|'offer'|'closed'; applied: string; nextAction: string; followUpBy: string }
export interface JobApplicationsData { rows: JobApplicationRow[] }
interface KeyResult { id: string; label: string; current: number; target: number; weight: number }
export interface OkrData { objective: string; keyResults: KeyResult[] }
interface DecisionJournalEntry { id: string; decision: string; context: string; expected: string; confidence: number; decidedOn: string; reviewOn: string; actual?: string; verdict?: 'hit'|'miss'|'mixed' }
export interface DecisionJournalData { entries: DecisionJournalEntry[] }
interface ReviewPrompt { id: string; q: string; answer: string }
export interface WeeklyReviewData { prompts: ReviewPrompt[]; weekOf: string; historyCount: number; streak: number; completedThisWeek: boolean }
interface SnippetEntry { id: string; title: string; body: string; tags: string[]; useCount: number }
export interface SnippetLibraryData { entries: SnippetEntry[] }
interface ContactCadenceRow { id: string; name: string; cadenceDays: number; lastContact: string; note: string }
export interface KeepInTouchData { rows: ContactCadenceRow[] }
interface GiftOccasionRow { id: string; person: string; date: string; ideas: string; budget: number; bought: boolean }
export interface GiftsOccasionsData { rows: GiftOccasionRow[] }
interface TripLeg { id: string; time: string; what: string; where: string; confirmation: string; booked: boolean }
interface TripDay { id: string; date: string; legs: TripLeg[] }
export interface TripItineraryData { tripName: string; startDate: string; days: TripDay[] }
interface GuestRow { id: string; name: string; status: 'invited'|'yes'|'no'|'maybe'; plusOnes: number; dietary: string }
export interface GuestListData { rows: GuestRow[] }

interface AtlasItem {
  id: string
  label: string
  value: number
  done: boolean
  date: string
  status: string
  note: string
}

/** Compact common persistence envelope for the global friction atlas. Each
 * type gives these slots domain meaning through its registry/field spec. */
export interface AtlasWidgetData {
  label: string
  /** The preset rendered by the consolidated Tracker widget. */
  trackerMode: string
  mode: string
  primary: number
  secondary: number
  target: number
  text: string
  date: string
  timeStart: string
  timeEnd: string
  enabled: boolean
  privateMode: boolean
  actionCount: number
  lastActionAt: number | null
  items: AtlasItem[]
  history: Array<{ t: number; v: number }>
  times: Record<string, string>
  /** Lazily populated snapshots let Tracker modes round-trip without resets. */
  modeStates?: Record<string, Omit<AtlasWidgetData, 'modeStates'>>
}

type TimekeeperMode = 'countdown' | 'pomodoro' | 'stopwatch'

/** One card with independent saved state for each timekeeping mode. */
export interface TimekeeperData {
  mode: TimekeeperMode
  countdown: TimerData
  pomodoro: PomodoroData
  stopwatch: StopwatchData
}

interface AutomationCoreItem {
  id: string
  key: string
  value: string
  status: 'idle' | 'running' | 'done' | 'failed' | 'waiting'
  at: number
}

/** Compact persistent envelope shared by the workflow-runtime family. */
export interface AutomationCoreData {
  label: string
  input: string
  output: string
  config: string
  mode: string
  enabled: boolean
  running: boolean
  count: number
  concurrency: number
  lastRunAt: number | null
  lastError: string
  items: AutomationCoreItem[]
}
import type { StopwatchData, TimerData } from './widgetDataCore'
import type { PomodoroData } from './widgetDataEducation'
