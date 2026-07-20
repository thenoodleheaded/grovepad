export interface PomodoroData {
  label: string
  workMinutes: number
  breakMinutes: number
  /** Which half of the cycle the timer is in. */
  phase: 'work' | 'break'
  /** Epoch ms the current phase ends at; null while paused/stopped. */
  endAt: number | null
  /** Seconds left in the current phase, valid while paused. */
  remainingSeconds: number
  /** Completed work sessions. */
  completed: number
}

interface VocabTerm {
  id: string
  term: string
  definition: string
  known: boolean
}

export interface VocabData {
  terms: VocabTerm[]
}

interface GradeComponent {
  id: string
  name: string
  /** Score achieved, 0–100. */
  score: number
  /** Relative weight (percent of final grade). */
  weight: number
}

export interface GradeCalcData {
  components: GradeComponent[]
  mode?: 'weighted' | 'gpa'
  /** GPA state is retained while the weighted-grade view is active. */
  gpa?: GpaData
}

interface GpaCourse {
  id: string
  name: string
  credits: number
  /** Grade points per credit, 0–4 (or 4.3 scale). */
  points: number
}

export interface GpaData {
  courses: GpaCourse[]
}

export type AssignmentStatus = 'todo' | 'doing' | 'done'

interface AssignmentItem {
  id: string
  title?: string
  /** ISO date (yyyy-mm-dd). */
  due: string
  status: AssignmentStatus
}

export interface AssignmentData {
  items: AssignmentItem[]
}

export interface CornellData {
  cues: string
  notes: string
  summary: string
}

interface FormulaItem {
  id: string
  name: string
  expression: string
}

export interface FormulaSheetData {
  formulas: FormulaItem[]
}

export type CitationStyle = 'APA' | 'MLA' | 'Chicago'

export interface CitationSource {
  id: string
  title: string
  author: string
  year: string
}

export interface CitationData {
  style: CitationStyle
  sources: CitationSource[]
}

export interface StudyGoalData {
  subject: string
  targetHours: number
  loggedHours: number
}

interface QuizOption {
  id: string
  text: string
  correct: boolean
}

export interface QuizData {
  prompt: string
  options: QuizOption[]
  /** Id of the option the user picked, or null before answering. */
  picked: string | null
}

// ── Essential branch-native module schemas ────────────────────────────────
