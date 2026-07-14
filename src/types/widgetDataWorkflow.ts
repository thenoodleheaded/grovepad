export interface TextInputData {
  label: string
  value: string
  placeholder: string
  multiline: boolean
}

export interface NumberInputData {
  label: string
  value: number
  min: number
  max: number
  step: number
}

export interface ToggleData {
  label: string
  value: boolean
}

export interface BranchGateData {
  question?: string
  value: boolean
  trueLabel: string
  falseLabel: string
  /** Optional per-outcome descriptions, editable only in the tall detail mode. */
  trueNote?: string
  falseNote?: string
}

export type FormulaOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo'

export interface FormulaData {
  label: string
  a: number
  b: number
  operator: FormulaOperator
}

export type WorkflowStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

export interface StatusData {
  label: string
  value: WorkflowStatus
}

export interface DatePickerData {
  label: string
  /** ISO date (yyyy-mm-dd). */
  date: string
  /** Local 24-hour time (HH:mm), or empty when unused. */
  time: string
  includeTime: boolean
}

export interface OutlineItem {
  id: string
  text: string
  depth: number
  collapsed: boolean
}

export interface OutlineData {
  items: OutlineItem[]
}

export type FormFieldType = 'text' | 'number' | 'checkbox'

export interface FormField {
  id: string
  label: string
  type: FormFieldType
  value: string | number | boolean
  required: boolean
}

export interface FormWidgetData {
  title: string
  fields: FormField[]
}

export interface AgendaItem {
  id: string
  time: string
  title: string
  done: boolean
}

export interface DailyAgendaData {
  /** ISO date (yyyy-mm-dd). */
  date: string
  items: AgendaItem[]
}

export type ProcessStepStatus = 'todo' | 'active' | 'done'

export interface ProcessStep {
  id: string
  label: string
  status: ProcessStepStatus
}

export interface ProcessData {
  steps: ProcessStep[]
}

export type RiskStatus = 'open' | 'resolved'
export type RiskLevel = 1 | 2 | 3 | 4 | 5

export interface RiskItem {
  id: string
  risk: string
  likelihood: RiskLevel
  impact: RiskLevel
  mitigation: string
  status: RiskStatus
}

export interface RiskRegisterData {
  items: RiskItem[]
}

export interface DecisionCriterion {
  id: string
  label: string
  weight: number
}

export interface DecisionOption {
  id: string
  label: string
  scores: number[]
}

export interface DecisionMatrixData {
  criteria: DecisionCriterion[]
  options: DecisionOption[]
}

export interface SwotData {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

export interface TimesheetEntry {
  id: string
  date: string
  label: string
  hours: number
  billable: boolean
}

export interface TimesheetData {
  currency: string
  hourlyRate: number
  entries: TimesheetEntry[]
}

export interface InventoryItem {
  id: string
  name: string
  quantity: number
  minimum: number
  unit: string
}

export interface InventoryData {
  items: InventoryItem[]
}

export type LogLevel = 'note' | 'info' | 'warning'

export interface LogEntry {
  id: string
  timestamp: string
  text: string
  level: LogLevel
}

export interface LogbookData {
  entries: LogEntry[]
}

export interface LineChartPoint {
  id: string
  label: string
  value: number
}

export interface LineChartData {
  title: string
  unit: string
  points: LineChartPoint[]
}

export interface PieChartSegment {
  id: string
  label: string
  value: number
  color: string
}

export interface PieChartData {
  title: string
  segments: PieChartSegment[]
  mode: 'donut' | 'pie'
}

