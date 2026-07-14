/** A point or displacement in either screen space or world space. */
export interface Vector2D {
  x: number
  y: number
}

/** A width/height pair in world units. */
export interface Size {
  width: number
  height: number
}

/**
 * The full spatial state of the canvas. `x`/`y` is the screen-space
 * translation of the world origin; `zoom` is the world→screen scale factor.
 *
 * screen = world * zoom + pan
 * world  = (screen - pan) / zoom
 */
export interface CanvasTransform {
  x: number
  y: number
  zoom: number
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 3.0

/** Base grid cell size in world units at zoom = 1. */
export const GRID_SIZE = 40

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/** Round a world-space value to the nearest grid line. */
export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  return Math.round(value / grid) * grid
}

export function screenToWorld(point: Vector2D, transform: CanvasTransform): Vector2D {
  return {
    x: (point.x - transform.x) / transform.zoom,
    y: (point.y - transform.y) / transform.zoom,
  }
}

// ---------------------------------------------------------------------------
// Ghost Tree Shaper
// ---------------------------------------------------------------------------

export type GhostShapeDirection = 'up' | 'down' | 'left' | 'right'

export interface GhostTreeNode {
  id: string
  parentId: string | null
  /** Stable sibling order; layout derives x/y from topology after each edit. */
  order: number
  x: number
  y: number
}

/** Live configuration of the tree being sculpted in ghost mode. */
export interface GhostTreeConfig {
  isActive: boolean
  /** World coordinate where the shaper was initiated (grid-snapped). */
  originX: number
  originY: number
  /** A lightweight editable tree. Every ghost node can become a parent. */
  nodes: GhostTreeNode[]
}

export const GHOST_SIBLINGS_PER_SIDE_MAX = 4

/** One grid-cell ghost marker; final widgets remain full-sized on commit. */
export const GHOST_CELL_WIDTH = 40
export const GHOST_CELL_HEIGHT = 40
/** Exactly two grid cells (80px) of clear space between 40px markers. */
export const GHOST_PITCH_X = 120
export const GHOST_PITCH_Y = 120

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Column index the tree is centered on (the root's column). */
export function ghostColumnOffset(width: number): number {
  return Math.floor((width - 1) / 2)
}

export function ghostCellPosition(
  originX: number,
  originY: number,
  row: number,
  col: number,
  width: number,
): Vector2D {
  const middle = ghostColumnOffset(width)
  return {
    x: originX + (col - middle) * GHOST_PITCH_X,
    y: originY + row * GHOST_PITCH_Y,
  }
}

/** Total widgets a ghost tree commit will create. */
export function ghostWidgetCount(depth: number, width: number): number {
  return depth <= 1 ? 1 : 1 + (depth - 1) * width
}

/** Total ghost cells in a direct-manipulation tree. */
export function ghostTreeWidgetCount(nodes: GhostTreeNode[]): number {
  return nodes.length
}

// ---------------------------------------------------------------------------
// Relation schema
// ---------------------------------------------------------------------------

export type RelationType = 'parent' | 'co-parent' | 'cousin' | 'blocker' | 'conflict'

export const RELATION_LABELS: Record<RelationType, string> = {
  parent: 'Parent',
  'co-parent': 'Co-parent',
  cousin: 'Cousin',
  blocker: 'Dependency',
  conflict: 'Conflict',
}

export interface Relation {
  id: string
  fromId: string
  toId: string
  type: RelationType
  isResolved: boolean
}

// ---------------------------------------------------------------------------
// Workspaces & canvas hierarchy
//
// Origin → Workspaces → Canvases → Widgets. A workspace is a top-level
// project; each owns a permanent root canvas ("Origin"). Deeper canvases are
// created by dropping a `canvas_node` widget onto any canvas — the branch
// hierarchy itself is the database; there is no separate file tree.
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string
  name: string
  /** Permanent root canvas of this workspace. */
  rootCanvasId: string
  createdAt: number
  sortIndex?: number
  tint?: string
}

export interface CanvasMeta {
  id: string
  name: string
  workspaceId: string
  /** null only for a workspace's root canvas. */
  parentCanvasId: string | null
}

// ---------------------------------------------------------------------------
// Module registry (content type per widget)
// ---------------------------------------------------------------------------

export type ModuleType =
  | 'notes'
  | 'bullets'
  | 'checklist'
  | 'table'
  | 'sketchpad'
  | 'budget'
  | 'progress'
  | 'ai_generator'
  | 'timeline'
  | 'dialog'
  | 'game_tuner'
  | 'audio_player'
  | 'canvas_node'
  | 'kanban'
  | 'countdown'
  | 'habit'
  | 'links'
  | 'code'
  | 'quote'
  | 'poll'
  | 'contact'
  | 'media'
  | 'metrics'
  | 'divider'
  | 'sticky_note'
  | 'calendar'
  | 'timer'
  | 'rating'
  | 'color_palette'
  | 'mood_tracker'
  | 'calculator'
  | 'bar_chart'
  | 'counter'
  | 'pros_cons'
  | 'weekly_planner'
  | 'goal_tracker'
  | 'stopwatch'
  | 'reading_list'
  | 'flashcards'
  | 'meeting_notes'
  | 'priority_matrix'
  | 'decision'
  | 'world_clock'
  | 'pomodoro'
  | 'vocab'
  | 'grade_calc'
  | 'gpa'
  | 'assignment'
  | 'cornell'
  | 'formula_sheet'
  | 'citation'
  | 'study_goal'
  | 'quiz'
  | 'text_input'
  | 'number_input'
  | 'toggle'
  | 'branch_gate'
  | 'formula'
  | 'status'
  | 'date_picker'
  | 'outline'
  | 'form'
  | 'daily_agenda'
  | 'process'
  | 'risk_register'
  | 'decision_matrix'
  | 'swot'
  | 'timesheet'
  | 'inventory'
  | 'logbook'
  | 'line_chart'
  | 'pie_chart'
  | 'unit_converter'
  | 'clock_pulse'
  | 'comparator'
  | 'aggregator'
  | 'range_mapper'
  | 'latch'
  | 'random_picker'
  | 'sequencer'
  | 'template'
  | 'recorder'
  | 'notifier'
  | 'subscriptions'
  | 'debt_payoff'
  | 'expense_split'
  | 'invoices'
  | 'meal_planner'
  | 'recipe'
  | 'home_maintenance'
  | 'chore_rotation'
  | 'renewals_vault'
  | 'medications'
  | 'workout_plan'
  | 'job_applications'
  | 'okr'
  | 'decision_journal'
  | 'weekly_review'
  | 'snippet_library'
  | 'keep_in_touch'
  | 'gifts_occasions'
  | 'trip_itinerary'
  | 'guest_list'
  | 'savings_circle' | 'zakat' | 'remittance_planner' | 'price_book'
  | 'utility_runway' | 'fuel_log' | 'side_income' | 'wishlist_saver'
  | 'vitals_log' | 'cycle_tracker' | 'fasting_window' | 'hydration'
  | 'sleep_ledger' | 'stretch_deck' | 'prayer_times' | 'scripture_plan'
  | 'gratitude_jar' | 'prayer_wall' | 'outage_schedule' | 'borrowed_items'
  | 'plant_care' | 'go_bag' | 'bin_night' | 'sun_window' | 'moving_boxes'
  | 'meeting_cost' | 'waiting_on' | 'office_hours' | 'scope_meter'
  | 'handover_note' | 'crit_queue' | 'on_call' | 'estimate_builder'
  | 'past_papers' | 'memorization_ladder' | 'experiments' | 'mistake_bank'
  | 'skill_tree' | 'care_plan' | 'gift_ledger' | 'team_kudos'
  | 'potluck_matrix' | 'star_chart' | 'pet_care' | 'visa_runway'
  | 'packing_matrix' | 'jet_lag_shifter' | 'currency_pocket'
  | 'commission_queue' | 'content_pipeline'
  | 'loop' | 'batch_processor' | 'parallel_runner' | 'race' | 'transaction' | 'subroutine' | 'approval_gate' | 'workflow_lock'
  | 'webhook_receiver' | 'manual_trigger' | 'canvas_lifecycle' | 'event_merger' | 'data_join' | 'object_builder' | 'event_correlator' | 'multi_source_aggregator'
  | 'widget_creator' | 'widget_updater' | 'widget_deleter' | 'branch_builder' | 'relation_builder' | 'canvas_router' | 'auto_grouper' | 'clone_branch' | 'template_instantiator' | 'archive_action' | 'auto_layout_action' | 'focus_action'
  | 'variable_store' | 'key_value_store' | 'queue' | 'stack_store' | 'set_store' | 'state_machine' | 'idempotency_store' | 'session_store' | 'mutex'
  | 'script_block' | 'local_function' | 'http_request' | 'webhook_sender' | 'secret_reference' | 'environment_config'
  | 'automation_console' | 'test_data_generator' | 'automation_recorder' | 'workflow_test_suite' | 'failure_inbox' | 'run_ledger'

export const MODULE_TYPES: readonly ModuleType[] = [
  'canvas_node',
  'notes',
  'bullets',
  'checklist',
  'table',
  'sketchpad',
  'budget',
  'progress',
  'ai_generator',
  'timeline',
  'dialog',
  'game_tuner',
  'audio_player',
  'kanban',
  'countdown',
  'habit',
  'links',
  'code',
  'quote',
  'poll',
  'contact',
  'media',
  'metrics',
  'divider',
  'sticky_note',
  'calendar',
  'timer',
  'rating',
  'color_palette',
  'mood_tracker',
  'calculator',
  'bar_chart',
  'counter',
  'pros_cons',
  'weekly_planner',
  'goal_tracker',
  'stopwatch',
  'reading_list',
  'flashcards',
  'meeting_notes',
  'priority_matrix',
  'decision',
  'world_clock',
  'pomodoro',
  'vocab',
  'grade_calc',
  'gpa',
  'assignment',
  'cornell',
  'formula_sheet',
  'citation',
  'study_goal',
  'quiz',
  'text_input',
  'number_input',
  'toggle',
  'branch_gate',
  'formula',
  'status',
  'date_picker',
  'outline',
  'form',
  'daily_agenda',
  'process',
  'risk_register',
  'decision_matrix',
  'swot',
  'timesheet',
  'inventory',
  'logbook',
  'line_chart',
  'pie_chart',
  'unit_converter',
  'clock_pulse', 'comparator', 'aggregator', 'range_mapper', 'latch', 'random_picker',
  'sequencer', 'template', 'recorder', 'notifier',
  'subscriptions', 'debt_payoff', 'expense_split', 'invoices', 'meal_planner', 'recipe',
  'home_maintenance', 'chore_rotation', 'renewals_vault', 'medications', 'workout_plan',
  'job_applications', 'okr', 'decision_journal', 'weekly_review', 'snippet_library',
  'keep_in_touch', 'gifts_occasions', 'trip_itinerary', 'guest_list',
  'savings_circle', 'zakat', 'remittance_planner', 'price_book', 'utility_runway',
  'fuel_log', 'side_income', 'wishlist_saver', 'vitals_log', 'cycle_tracker',
  'fasting_window', 'hydration', 'sleep_ledger', 'stretch_deck', 'prayer_times',
  'scripture_plan', 'gratitude_jar', 'prayer_wall', 'outage_schedule', 'borrowed_items',
  'plant_care', 'go_bag', 'bin_night', 'sun_window', 'moving_boxes', 'meeting_cost',
  'waiting_on', 'office_hours', 'scope_meter', 'handover_note', 'crit_queue', 'on_call',
  'estimate_builder', 'past_papers', 'memorization_ladder', 'experiments', 'mistake_bank',
  'skill_tree', 'care_plan', 'gift_ledger', 'team_kudos', 'potluck_matrix', 'star_chart',
  'pet_care', 'visa_runway', 'packing_matrix', 'jet_lag_shifter', 'currency_pocket',
  'commission_queue', 'content_pipeline',
  'loop','batch_processor','parallel_runner','race','transaction','subroutine','approval_gate','workflow_lock',
  'webhook_receiver','manual_trigger','canvas_lifecycle','event_merger','data_join','object_builder','event_correlator','multi_source_aggregator',
  'widget_creator','widget_updater','widget_deleter','branch_builder','relation_builder','canvas_router','auto_grouper','clone_branch','template_instantiator','archive_action','auto_layout_action','focus_action',
  'variable_store','key_value_store','queue','stack_store','set_store','state_machine','idempotency_store','session_store','mutex',
  'script_block','local_function','http_request','webhook_sender','secret_reference','environment_config',
  'automation_console','test_data_generator','automation_recorder','workflow_test_suite','failure_inbox','run_ledger',
]

export const MODULE_LABELS: Record<ModuleType, string> = {
  notes: 'Notes',
  bullets: 'Bullets',
  checklist: 'Checklist',
  table: 'Table',
  sketchpad: 'Sketchpad',
  budget: 'Budget',
  progress: 'Progress',
  ai_generator: 'AI Generator',
  timeline: 'Timeline',
  dialog: 'Dialog',
  game_tuner: 'Game Mechanics Tuner',
  audio_player: 'Synthesizer & Audio Player',
  canvas_node: 'Canvas',
  kanban: 'Kanban',
  countdown: 'Countdown',
  habit: 'Habit Tracker',
  links: 'Link List',
  code: 'Code Snippet',
  quote: 'Quote',
  poll: 'Poll',
  contact: 'Contact Card',
  media: 'Media',
  metrics: 'Metrics',
  divider: 'Divider',
  sticky_note: 'Sticky Note',
  calendar: 'Calendar',
  timer: 'Timer',
  rating: 'Rating',
  color_palette: 'Color Palette',
  mood_tracker: 'Mood Tracker',
  calculator: 'Calculator',
  bar_chart: 'Bar Chart',
  counter: 'Counter',
  pros_cons: 'Pros & Cons',
  weekly_planner: 'Week Planner',
  goal_tracker: 'Goal Tracker',
  stopwatch: 'Stopwatch',
  reading_list: 'Reading List',
  flashcards: 'Flashcards',
  meeting_notes: 'Meeting Notes',
  priority_matrix: 'Priority Matrix',
  decision: 'Decision Picker',
  world_clock: 'World Clock',
  pomodoro: 'Pomodoro Timer',
  vocab: 'Vocabulary',
  grade_calc: 'Grade Calculator',
  gpa: 'GPA Tracker',
  assignment: 'Assignments',
  cornell: 'Cornell Notes',
  formula_sheet: 'Formula Sheet',
  citation: 'Citations',
  study_goal: 'Study Goal',
  quiz: 'Quiz',
  text_input: 'Text Input',
  number_input: 'Number Input',
  toggle: 'Toggle',
  branch_gate: 'Bool Gate',
  formula: 'Formula',
  status: 'Status',
  date_picker: 'Date & Time',
  outline: 'Outline',
  form: 'Form',
  daily_agenda: 'Daily Agenda',
  process: 'Process / SOP',
  risk_register: 'Risk Register',
  decision_matrix: 'Decision Matrix',
  swot: 'SWOT Analysis',
  timesheet: 'Timesheet',
  inventory: 'Inventory',
  logbook: 'Logbook',
  line_chart: 'Line Chart',
  pie_chart: 'Donut Chart',
  unit_converter: 'Unit Converter',
  clock_pulse: 'Schedule Pulse',
  comparator: 'Comparator',
  aggregator: 'Aggregator',
  range_mapper: 'Range Mapper',
  latch: 'Snapshot Latch',
  random_picker: 'Random Picker',
  sequencer: 'Sequencer',
  template: 'Text Composer',
  recorder: 'Recorder',
  notifier: 'Notifier',
  subscriptions: 'Subscriptions',
  debt_payoff: 'Debt Payoff',
  expense_split: 'Expense Split',
  invoices: 'Invoices',
  meal_planner: 'Meal Planner',
  recipe: 'Recipe',
  home_maintenance: 'Home Maintenance',
  chore_rotation: 'Chore Rotation',
  renewals_vault: 'Renewals Vault',
  medications: 'Medications',
  workout_plan: 'Workout Plan',
  job_applications: 'Job Applications',
  okr: 'OKRs',
  decision_journal: 'Decision Journal',
  weekly_review: 'Weekly Review',
  snippet_library: 'Snippet Library',
  keep_in_touch: 'Keep in Touch',
  gifts_occasions: 'Gifts & Occasions',
  trip_itinerary: 'Trip Itinerary',
  guest_list: 'Guest List',
  savings_circle:'Savings Circle', zakat:'Zakat & Giving', remittance_planner:'Remittance', price_book:'Price Book',
  utility_runway:'Utility Runway', fuel_log:'Fuel Log', side_income:'Income Streams', wishlist_saver:'Wishlist',
  vitals_log:'Vitals', cycle_tracker:'Cycle', fasting_window:'Fasting', hydration:'Hydration', sleep_ledger:'Sleep Ledger', stretch_deck:'Stretch Deck',
  prayer_times:'Prayer Times', scripture_plan:'Scripture Plan', gratitude_jar:'Gratitude Jar', prayer_wall:'Prayer Wall',
  outage_schedule:'Power Schedule', borrowed_items:'Borrow Ledger', plant_care:'Plant Shelf', go_bag:'Go Bag', bin_night:'Bin Night', sun_window:'Sun Window', moving_boxes:'Moving Boxes',
  meeting_cost:'Meeting Meter', waiting_on:'Waiting On', office_hours:'Overlap Finder', scope_meter:'Scope Meter', handover_note:'Handover', crit_queue:'Crit Room', on_call:'On-Call', estimate_builder:'Estimate',
  past_papers:'Past Papers', memorization_ladder:'Memorization', experiments:'Experiments', mistake_bank:'Mistake Bank', skill_tree:'Skill Tree',
  care_plan:'Care Plan', gift_ledger:'Gift Ledger', team_kudos:'Applause Meter', potluck_matrix:'Potluck Board', star_chart:'Star Chart', pet_care:'Pet Card',
  visa_runway:'Visa Runway', packing_matrix:'Packing', jet_lag_shifter:'Jet Lag Plan', currency_pocket:'Cash Pockets', commission_queue:'Commission Queue', content_pipeline:'Content Pipeline',
  loop:'Loop', batch_processor:'Batch Processor', parallel_runner:'Parallel Runner', race:'Race', transaction:'Transaction', subroutine:'Subroutine', approval_gate:'Approval Gate', workflow_lock:'Workflow Lock',
  webhook_receiver:'Webhook Receiver', manual_trigger:'Manual Trigger', canvas_lifecycle:'Canvas Lifecycle', event_merger:'Event Merger', data_join:'Data Join', object_builder:'Object Builder', event_correlator:'Event Correlator', multi_source_aggregator:'Multi-Source Aggregator',
  widget_creator:'Widget Creator', widget_updater:'Widget Updater', widget_deleter:'Widget Deleter', branch_builder:'Branch Builder', relation_builder:'Relation Builder', canvas_router:'Canvas Router', auto_grouper:'Auto Grouper', clone_branch:'Clone Branch', template_instantiator:'Template Instantiator', archive_action:'Archive Action', auto_layout_action:'Auto Layout Action', focus_action:'Focus Action',
  variable_store:'Variable Store', key_value_store:'Key-Value Store', queue:'Queue', stack_store:'Stack', set_store:'Set Store', state_machine:'State Machine', idempotency_store:'Idempotency Store', session_store:'Session Store', mutex:'Mutex',
  script_block:'Script Block', local_function:'Local Function', http_request:'HTTP Request', webhook_sender:'Webhook Sender', secret_reference:'Secret Reference', environment_config:'Environment Config',
  automation_console:'Automation Console', test_data_generator:'Test Data Generator', automation_recorder:'Automation Recorder', workflow_test_suite:'Workflow Test Suite', failure_inbox:'Failure Inbox', run_ledger:'Run Ledger',
}

// ---------------------------------------------------------------------------
// Domain Packs
// ---------------------------------------------------------------------------

export type DomainPack =
  | 'game_dev'
  | 'music_production'
  | 'software_eng'
  | 'data_science'
  | 'ux_design'
  | 'creative_writing'
  | 'digital_marketing'
  | 'finance_analytics'
  | 'project_management'
  | 'education'
  | 'cybersecurity'
  | 'hardware_engineering'
  | 'healthcare'
  | 'legal_tech'
  | 'life'

export const DOMAIN_PACKS: readonly DomainPack[] = [
  'game_dev',
  'music_production',
  'software_eng',
  'data_science',
  'ux_design',
  'creative_writing',
  'digital_marketing',
  'finance_analytics',
  'project_management',
  'education',
  'cybersecurity',
  'hardware_engineering',
  'healthcare',
  'legal_tech',
  'life',
]

export const DOMAIN_PACK_LABELS: Record<DomainPack, string> = {
  game_dev: 'Game Development',
  music_production: 'Music Production',
  software_eng: 'Software Engineering',
  data_science: 'Data Science',
  ux_design: 'UX/UI Design',
  creative_writing: 'Creative Writing',
  digital_marketing: 'Digital Marketing',
  finance_analytics: 'Finance & Analytics',
  project_management: 'Project Management',
  education: 'Education & Academics',
  cybersecurity: 'Cybersecurity',
  hardware_engineering: 'Hardware Engineering',
  healthcare: 'Healthcare & Biotech',
  legal_tech: 'Legal Technology',
  life: 'Life Systems',
}

export const MODULE_PACK_REQUIREMENTS: Partial<Record<ModuleType, DomainPack>> = {
  // game_dev
  game_tuner: 'game_dev',

  // music_production
  audio_player: 'music_production',

  // creative_writing
  dialog: 'creative_writing',
  commission_queue: 'creative_writing',
  outline: 'creative_writing',
  logbook: 'creative_writing',

  // ux_design
  color_palette: 'ux_design',
  ai_generator: 'ux_design',

  // education
  vocab: 'education',
  grade_calc: 'education',
  gpa: 'education',
  assignment: 'education',
  cornell: 'education',
  formula_sheet: 'education',
  citation: 'education',
  study_goal: 'education',
  quiz: 'education',
  pomodoro: 'education',
  past_papers: 'education',
  memorization_ladder: 'education',
  skill_tree: 'education',
  flashcards: 'education',
  reading_list: 'education',

  // finance_analytics
  budget: 'finance_analytics',
  unit_converter: 'finance_analytics',
  estimate_builder: 'finance_analytics',
  timesheet: 'finance_analytics',
  inventory: 'finance_analytics',

  // project_management
  timeline: 'project_management',
  daily_agenda: 'project_management',
  priority_matrix: 'project_management',
  decision: 'project_management',
  process: 'project_management',
  risk_register: 'project_management',
  decision_matrix: 'project_management',
  swot: 'project_management',
  content_pipeline: 'project_management',
  scope_meter: 'project_management',
  handover_note: 'project_management',
  crit_queue: 'project_management',
  date_picker: 'project_management',
  form: 'project_management',
  waiting_on: 'project_management',
  office_hours: 'project_management',
  meeting_cost: 'project_management',
  countdown: 'project_management',
  poll: 'project_management',
  pros_cons: 'project_management',
  meeting_notes: 'project_management',

  // data_science
  bar_chart: 'data_science',
  line_chart: 'data_science',
  pie_chart: 'data_science',
  metrics: 'data_science',
  rating: 'data_science',
  experiments: 'data_science',
  mistake_bank: 'data_science',

  // software_eng
  loop: 'software_eng',
  batch_processor: 'software_eng',
  parallel_runner: 'software_eng',
  race: 'software_eng',
  transaction: 'software_eng',
  subroutine: 'software_eng',
  approval_gate: 'software_eng',
  workflow_lock: 'software_eng',
  webhook_receiver: 'software_eng',
  manual_trigger: 'software_eng',
  canvas_lifecycle: 'software_eng',
  event_merger: 'software_eng',
  data_join: 'software_eng',
  object_builder: 'software_eng',
  event_correlator: 'software_eng',
  multi_source_aggregator: 'software_eng',
  widget_creator: 'software_eng',
  widget_updater: 'software_eng',
  widget_deleter: 'software_eng',
  branch_builder: 'software_eng',
  relation_builder: 'software_eng',
  canvas_router: 'software_eng',
  auto_grouper: 'software_eng',
  clone_branch: 'software_eng',
  template_instantiator: 'software_eng',
  archive_action: 'software_eng',
  auto_layout_action: 'software_eng',
  focus_action: 'software_eng',
  variable_store: 'software_eng',
  key_value_store: 'software_eng',
  queue: 'software_eng',
  stack_store: 'software_eng',
  set_store: 'software_eng',
  state_machine: 'software_eng',
  idempotency_store: 'software_eng',
  session_store: 'software_eng',
  mutex: 'software_eng',
  script_block: 'software_eng',
  local_function: 'software_eng',
  http_request: 'software_eng',
  webhook_sender: 'software_eng',
  secret_reference: 'software_eng',
  environment_config: 'software_eng',
  automation_console: 'software_eng',
  test_data_generator: 'software_eng',
  automation_recorder: 'software_eng',
  workflow_test_suite: 'software_eng',
  failure_inbox: 'software_eng',
  run_ledger: 'software_eng',
  clock_pulse: 'software_eng',
  comparator: 'software_eng',
  aggregator: 'software_eng',
  range_mapper: 'software_eng',
  latch: 'software_eng',
  random_picker: 'software_eng',
  sequencer: 'software_eng',
  template: 'software_eng',
  recorder: 'software_eng',
  notifier: 'software_eng',
  branch_gate: 'software_eng',
  status: 'software_eng',
  on_call: 'software_eng',

  // life
  subscriptions: 'life',
  debt_payoff: 'life',
  expense_split: 'life',
  invoices: 'life',
  meal_planner: 'life',
  recipe: 'life',
  home_maintenance: 'life',
  chore_rotation: 'life',
  renewals_vault: 'life',
  medications: 'life',
  workout_plan: 'life',
  job_applications: 'life',
  okr: 'life',
  decision_journal: 'life',
  weekly_review: 'life',
  snippet_library: 'life',
  keep_in_touch: 'life',
  gifts_occasions: 'life',
  trip_itinerary: 'life',
  guest_list: 'life',
  savings_circle: 'life',
  zakat: 'life',
  remittance_planner: 'life',
  price_book: 'life',
  utility_runway: 'life',
  fuel_log: 'life',
  side_income: 'life',
  wishlist_saver: 'life',
  vitals_log: 'life',
  cycle_tracker: 'life',
  fasting_window: 'life',
  hydration: 'life',
  sleep_ledger: 'life',
  stretch_deck: 'life',
  prayer_times: 'life',
  scripture_plan: 'life',
  gratitude_jar: 'life',
  prayer_wall: 'life',
  outage_schedule: 'life',
  borrowed_items: 'life',
  plant_care: 'life',
  go_bag: 'life',
  bin_night: 'life',
  sun_window: 'life',
  moving_boxes: 'life',
  care_plan: 'life',
  gift_ledger: 'life',
  team_kudos: 'life',
  potluck_matrix: 'life',
  star_chart: 'life',
  pet_care: 'life',
  visa_runway: 'life',
  packing_matrix: 'life',
  jet_lag_shifter: 'life',
  currency_pocket: 'life',
  world_clock: 'life',
  contact: 'life',
  habit: 'life',
  mood_tracker: 'life',
}

// ---------------------------------------------------------------------------
// Per-module data schemas
// ---------------------------------------------------------------------------

export interface NotesData {
  text: string
}

export interface BulletsData {
  items: string[]
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface ChecklistData {
  items: ChecklistItem[]
}

/** Row-major cell matrix; the first row renders as the header. */
export interface TableData {
  rows: string[][]
}

export interface SketchpadData {
  height: number
}

export interface BudgetItem {
  id: string
  label: string
  amount: number
}

export interface BudgetData {
  currency: string
  items: BudgetItem[]
}

export interface ProgressData {
  label: string
  percent: number
}

export interface AiGeneratorData {
  prompt: string
  status: 'idle' | 'generating' | 'done'
}

export interface TimelinePhase {
  id: string
  label: string
  start: number
  span: number
}

export interface TimelineData {
  totalUnits: number
  phases: TimelinePhase[]
}

export interface DialogLine {
  id: string
  character: string
  cue: string
}

export interface DialogData {
  lines: DialogLine[]
}

export interface GameTunerData {
  grip: number
  drift: number
  stability: number
}

export interface AudioPlayerData {
  bpm: number
  key: string
  signalChain: string
  isPlaying: boolean
}

/** A card that IS a navigable sub-canvas ("canvas file"). */
export interface CanvasNodeData {
  /** Id of the canvas this node opens. */
  canvasId: string
}

export interface KanbanCard {
  id: string
  label: string
}

export interface KanbanColumn {
  id: string
  label: string
  cards: KanbanCard[]
}

export interface KanbanData {
  columns: KanbanColumn[]
}

export interface CountdownData {
  label: string
  /** ISO date (yyyy-mm-dd). */
  targetDate: string
}

export interface HabitData {
  label: string
  /** Mon..Sun completion for the current week. */
  days: boolean[]
  streak: number
}

export interface LinkItem {
  id: string
  label: string
  url: string
}

export interface LinksData {
  items: LinkItem[]
}

export interface CodeData {
  language: string
  code: string
}

export interface QuoteData {
  text: string
  attribution: string
}

export interface PollOption {
  id: string
  label: string
  votes: number
}

export interface PollData {
  question: string
  options: PollOption[]
}

export interface ContactData {
  name: string
  role: string
  email: string
  phone: string
}

export interface MediaData {
  /** Image URL or data URL. */
  url: string
  caption: string
  altText?: string
  /** Large pasted images live outside the synced board JSON. */
  localBlobKey?: string
}

export type MetricTrend = 'up' | 'down' | 'flat'

export interface MetricTile {
  id: string
  label: string
  value: string
  unit: string
  trend: MetricTrend
}

export interface MetricsData {
  tiles: MetricTile[]
}

export interface DividerData {
  label: string
}

export type StickyNoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple'

export interface StickyNoteData {
  text: string
  color: StickyNoteColor
}

export interface CalendarData {
  /** Full year, e.g. 2026. */
  year: number
  /** 0-indexed month (0 = January). */
  month: number
  /** ISO dates (yyyy-mm-dd) marked with a dot. */
  markedDates: string[]
}

export interface TimerData {
  label: string
  /** Configured countdown length. */
  durationSeconds: number
  /** Seconds left, valid while the timer is paused/stopped. */
  remainingSeconds: number
  /** Epoch ms the timer completes at; null while paused/stopped. */
  endAt: number | null
}

export interface RatingData {
  label: string
  /** 0-5. */
  value: number
}

export interface ColorPaletteData {
  /** Hex strings, e.g. "#a3e635". */
  colors: string[]
}

export interface MoodTrackerData {
  /** Mon..Sun — index into the mood scale, or null if unset. */
  days: Array<number | null>
}

export interface CalculatorData {
  expression: string
  result: string
}

export interface BarChartItem {
  id: string
  label: string
  value: number
}

export interface BarChartData {
  title: string
  bars: BarChartItem[]
}

export interface CounterData {
  label: string
  count: number
  step: number
}

export interface ProsConsItem {
  id: string
  text: string
}

export interface ProsConsData {
  topic: string
  pros: ProsConsItem[]
  cons: ProsConsItem[]
}

export interface PlannerTask {
  id: string
  text: string
  done: boolean
}

export interface WeeklyPlannerData {
  /** Mon..Sun task lists. */
  days: PlannerTask[][]
}

export interface GoalMilestone {
  id: string
  label: string
  done: boolean
}

export interface GoalTrackerData {
  goal: string
  milestones: GoalMilestone[]
}

export interface StopwatchData {
  /** Total ms accumulated before the current run. */
  elapsedMs: number
  /** Epoch ms when the current run started; null while paused. */
  startedAt: number | null
  /** Lap totals (elapsed ms at each lap press), newest last. */
  laps: number[]
}

export type ReadingStatus = 'queued' | 'reading' | 'done'

export interface ReadingItem {
  id: string
  title: string
  status: ReadingStatus
}

export interface ReadingListData {
  items: ReadingItem[]
}

export interface Flashcard {
  id: string
  front: string
  back: string
}

export interface FlashcardsData {
  cards: Flashcard[]
  /** Index of the card currently shown. */
  current: number
}

export interface MeetingActionItem {
  id: string
  text: string
  done: boolean
}

export interface MeetingNotesData {
  /** ISO date (yyyy-mm-dd). */
  date: string
  attendees: string
  notes: string
  actions: MeetingActionItem[]
}

/** Quadrants: 0 = urgent+important, 1 = important, 2 = urgent, 3 = neither. */
export interface MatrixItem {
  id: string
  text: string
  quadrant: 0 | 1 | 2 | 3
}

export interface PriorityMatrixData {
  items: MatrixItem[]
}

export interface DecisionData {
  question?: string
  options: string[]
  /** Index of the picked option; null before the first spin. */
  pickedIndex: number | null
}

export interface WorldClockData {
  /** IANA timezone names, e.g. "America/New_York". */
  zones: string[]
}

// ── Study & learning module schemas ────────────────────────────────────────

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

export interface VocabTerm {
  id: string
  term: string
  definition: string
  known: boolean
}

export interface VocabData {
  terms: VocabTerm[]
}

export interface GradeComponent {
  id: string
  name: string
  /** Score achieved, 0–100. */
  score: number
  /** Relative weight (percent of final grade). */
  weight: number
}

export interface GradeCalcData {
  components: GradeComponent[]
}

export interface GpaCourse {
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

export interface AssignmentItem {
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

export interface FormulaItem {
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

export interface QuizOption {
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
export interface RangeBand { id: string; upTo: number; label: string; emoji?: string }
export interface RangeMapperData { label: string; input: number; bands: RangeBand[] }
export interface LatchData { label: string; current: number; held: number; heldAt: number | null }
export interface RandomPickerOption { id: string; text: string; weight: number }
export interface RandomPickerData { label: string; options: RandomPickerOption[]; pick: string; history: string[]; lastRolledAt: number | null; noRepeatWindow: number }
export interface SequencerStep { id: string; text: string }
export interface SequencerData { label: string; steps: SequencerStep[]; activeIndex: number; loop: boolean }
export interface TemplateData { template: string; slotA: string; slotB: string; slotC: string; slotD: string }
export interface RecorderData { label: string; input: number; samples: SeriesPoint[]; mode: 'on_change'|'daily'|'on_command'; lastRecordedAt: number | null }
export interface NotifierData { label: string; message: string; channel: 'toast'|'browser'; cooldownMinutes: number; armed: boolean; lastFiredAt: number | null; fireCount: number; pendingFireAt: number | null }

export interface SubscriptionRow { id: string; name: string; cost: number; cycle: 'monthly'|'yearly'|'weekly'; renewsOn: string; active: boolean }
export interface SubscriptionsData { rows: SubscriptionRow[] }
export interface DebtRow { id: string; name: string; balance: number; apr: number; minPayment: number }
export interface DebtPayoffData { debts: DebtRow[]; extraPayment: number; strategy: 'snowball'|'avalanche' }
export interface SplitExpense { id: string; desc: string; amount: number; paidBy: string; splitAmong: string[] }
export interface ExpenseSplitData { people: string[]; you: string; expenses: SplitExpense[] }
export interface InvoiceRow { id: string; client: string; amount: number; issued: string; due: string; status: 'draft'|'sent'|'paid' }
export interface InvoicesData { rows: InvoiceRow[] }
export interface MealSlot { id: string; day: number; meal: 'breakfast'|'lunch'|'dinner'; dish: string; recipeWidgetId?: string }
export interface MealPlannerData { week: MealSlot[]; shoppingList: string }
export interface RecipeIngredient { id: string; qty: number; unit: string; item: string }
export interface RecipeStep { id: string; text: string; done: boolean }
export interface RecipeData { title: string; servings: number; baseServings: number; ingredients: RecipeIngredient[]; steps: RecipeStep[]; cookMinutes: number }
export interface MaintenanceRow { id: string; task: string; everyMonths: number; lastDone: string }
export interface HomeMaintenanceData { rows: MaintenanceRow[] }
export interface ChoreRotationData { people: string[]; chores: string[]; offset: number; cadenceLabel: string }
export interface RenewalRow { id: string; item: string; expires: string; noteRef: string; renewLeadDays: number }
export interface RenewalsVaultData { rows: RenewalRow[] }
export interface MedicationRow { id: string; name: string; timesPerDay: number; takenToday: boolean[]; pillsLeft: number; dailyUse: number }
export interface MedicationsData { rows: MedicationRow[] }
export interface WorkoutExercise { id: string; name: string; sets: number; reps: number; weight: number; done: boolean }
export interface WorkoutDay { id: string; label: string; exercises: WorkoutExercise[] }
export interface WorkoutPlanData { days: WorkoutDay[]; activeDay: number; lastSession: string }
export interface JobApplicationRow { id: string; company: string; role: string; stage: 'wishlist'|'applied'|'screen'|'interview'|'offer'|'closed'; applied: string; nextAction: string; followUpBy: string }
export interface JobApplicationsData { rows: JobApplicationRow[] }
export interface KeyResult { id: string; label: string; current: number; target: number; weight: number }
export interface OkrData { objective: string; keyResults: KeyResult[] }
export interface DecisionJournalEntry { id: string; decision: string; context: string; expected: string; confidence: number; decidedOn: string; reviewOn: string; actual?: string; verdict?: 'hit'|'miss'|'mixed' }
export interface DecisionJournalData { entries: DecisionJournalEntry[] }
export interface ReviewPrompt { id: string; q: string; answer: string }
export interface WeeklyReviewData { prompts: ReviewPrompt[]; weekOf: string; historyCount: number; streak: number; completedThisWeek: boolean }
export interface SnippetEntry { id: string; title: string; body: string; tags: string[]; useCount: number }
export interface SnippetLibraryData { entries: SnippetEntry[] }
export interface ContactCadenceRow { id: string; name: string; cadenceDays: number; lastContact: string; note: string }
export interface KeepInTouchData { rows: ContactCadenceRow[] }
export interface GiftOccasionRow { id: string; person: string; date: string; ideas: string; budget: number; bought: boolean }
export interface GiftsOccasionsData { rows: GiftOccasionRow[] }
export interface TripLeg { id: string; time: string; what: string; where: string; confirmation: string; booked: boolean }
export interface TripDay { id: string; date: string; legs: TripLeg[] }
export interface TripItineraryData { tripName: string; startDate: string; days: TripDay[] }
export interface GuestRow { id: string; name: string; status: 'invited'|'yes'|'no'|'maybe'; plusOnes: number; dietary: string }
export interface GuestListData { rows: GuestRow[] }

export interface AtlasItem {
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
}

export interface AutomationCoreItem {
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

/** Maps every module type to its data schema. */
export interface ModuleDataMap {
  notes: NotesData
  bullets: BulletsData
  checklist: ChecklistData
  table: TableData
  sketchpad: SketchpadData
  budget: BudgetData
  progress: ProgressData
  ai_generator: AiGeneratorData
  timeline: TimelineData
  dialog: DialogData
  game_tuner: GameTunerData
  audio_player: AudioPlayerData
  canvas_node: CanvasNodeData
  kanban: KanbanData
  countdown: CountdownData
  habit: HabitData
  links: LinksData
  code: CodeData
  quote: QuoteData
  poll: PollData
  contact: ContactData
  media: MediaData
  metrics: MetricsData
  divider: DividerData
  sticky_note: StickyNoteData
  calendar: CalendarData
  timer: TimerData
  rating: RatingData
  color_palette: ColorPaletteData
  mood_tracker: MoodTrackerData
  calculator: CalculatorData
  bar_chart: BarChartData
  counter: CounterData
  pros_cons: ProsConsData
  weekly_planner: WeeklyPlannerData
  goal_tracker: GoalTrackerData
  stopwatch: StopwatchData
  reading_list: ReadingListData
  flashcards: FlashcardsData
  meeting_notes: MeetingNotesData
  priority_matrix: PriorityMatrixData
  decision: DecisionData
  world_clock: WorldClockData
  pomodoro: PomodoroData
  vocab: VocabData
  grade_calc: GradeCalcData
  gpa: GpaData
  assignment: AssignmentData
  cornell: CornellData
  formula_sheet: FormulaSheetData
  citation: CitationData
  study_goal: StudyGoalData
  quiz: QuizData
  text_input: TextInputData
  number_input: NumberInputData
  toggle: ToggleData
  branch_gate: BranchGateData
  formula: FormulaData
  status: StatusData
  date_picker: DatePickerData
  outline: OutlineData
  form: FormWidgetData
  daily_agenda: DailyAgendaData
  process: ProcessData
  risk_register: RiskRegisterData
  decision_matrix: DecisionMatrixData
  swot: SwotData
  timesheet: TimesheetData
  inventory: InventoryData
  logbook: LogbookData
  line_chart: LineChartData
  pie_chart: PieChartData
  unit_converter: UnitConverterData
  clock_pulse: ClockPulseData
  comparator: ComparatorData
  aggregator: AggregatorData
  range_mapper: RangeMapperData
  latch: LatchData
  random_picker: RandomPickerData
  sequencer: SequencerData
  template: TemplateData
  recorder: RecorderData
  notifier: NotifierData
  subscriptions: SubscriptionsData
  debt_payoff: DebtPayoffData
  expense_split: ExpenseSplitData
  invoices: InvoicesData
  meal_planner: MealPlannerData
  recipe: RecipeData
  home_maintenance: HomeMaintenanceData
  chore_rotation: ChoreRotationData
  renewals_vault: RenewalsVaultData
  medications: MedicationsData
  workout_plan: WorkoutPlanData
  job_applications: JobApplicationsData
  okr: OkrData
  decision_journal: DecisionJournalData
  weekly_review: WeeklyReviewData
  snippet_library: SnippetLibraryData
  keep_in_touch: KeepInTouchData
  gifts_occasions: GiftsOccasionsData
  trip_itinerary: TripItineraryData
  guest_list: GuestListData
  savings_circle: AtlasWidgetData
  zakat: AtlasWidgetData
  remittance_planner: AtlasWidgetData
  price_book: AtlasWidgetData
  utility_runway: AtlasWidgetData
  fuel_log: AtlasWidgetData
  side_income: AtlasWidgetData
  wishlist_saver: AtlasWidgetData
  vitals_log: AtlasWidgetData
  cycle_tracker: AtlasWidgetData
  fasting_window: AtlasWidgetData
  hydration: AtlasWidgetData
  sleep_ledger: AtlasWidgetData
  stretch_deck: AtlasWidgetData
  prayer_times: AtlasWidgetData
  scripture_plan: AtlasWidgetData
  gratitude_jar: AtlasWidgetData
  prayer_wall: AtlasWidgetData
  outage_schedule: AtlasWidgetData
  borrowed_items: AtlasWidgetData
  plant_care: AtlasWidgetData
  go_bag: AtlasWidgetData
  bin_night: AtlasWidgetData
  sun_window: AtlasWidgetData
  moving_boxes: AtlasWidgetData
  meeting_cost: AtlasWidgetData
  waiting_on: AtlasWidgetData
  office_hours: AtlasWidgetData
  scope_meter: AtlasWidgetData
  handover_note: AtlasWidgetData
  crit_queue: AtlasWidgetData
  on_call: AtlasWidgetData
  estimate_builder: AtlasWidgetData
  past_papers: AtlasWidgetData
  memorization_ladder: AtlasWidgetData
  experiments: AtlasWidgetData
  mistake_bank: AtlasWidgetData
  skill_tree: AtlasWidgetData
  care_plan: AtlasWidgetData
  gift_ledger: AtlasWidgetData
  team_kudos: AtlasWidgetData
  potluck_matrix: AtlasWidgetData
  star_chart: AtlasWidgetData
  pet_care: AtlasWidgetData
  visa_runway: AtlasWidgetData
  packing_matrix: AtlasWidgetData
  jet_lag_shifter: AtlasWidgetData
  currency_pocket: AtlasWidgetData
  commission_queue: AtlasWidgetData
  content_pipeline: AtlasWidgetData
  loop: AutomationCoreData
  batch_processor: AutomationCoreData
  parallel_runner: AutomationCoreData
  race: AutomationCoreData
  transaction: AutomationCoreData
  subroutine: AutomationCoreData
  approval_gate: AutomationCoreData
  workflow_lock: AutomationCoreData
  webhook_receiver: AutomationCoreData
  manual_trigger: AutomationCoreData
  canvas_lifecycle: AutomationCoreData
  event_merger: AutomationCoreData
  data_join: AutomationCoreData
  object_builder: AutomationCoreData
  event_correlator: AutomationCoreData
  multi_source_aggregator: AutomationCoreData
  widget_creator: AutomationCoreData
  widget_updater: AutomationCoreData
  widget_deleter: AutomationCoreData
  branch_builder: AutomationCoreData
  relation_builder: AutomationCoreData
  canvas_router: AutomationCoreData
  auto_grouper: AutomationCoreData
  clone_branch: AutomationCoreData
  template_instantiator: AutomationCoreData
  archive_action: AutomationCoreData
  auto_layout_action: AutomationCoreData
  focus_action: AutomationCoreData
  variable_store: AutomationCoreData
  key_value_store: AutomationCoreData
  queue: AutomationCoreData
  stack_store: AutomationCoreData
  set_store: AutomationCoreData
  state_machine: AutomationCoreData
  idempotency_store: AutomationCoreData
  session_store: AutomationCoreData
  mutex: AutomationCoreData
  script_block: AutomationCoreData
  local_function: AutomationCoreData
  http_request: AutomationCoreData
  webhook_sender: AutomationCoreData
  secret_reference: AutomationCoreData
  environment_config: AutomationCoreData
  automation_console: AutomationCoreData
  test_data_generator: AutomationCoreData
  automation_recorder: AutomationCoreData
  workflow_test_suite: AutomationCoreData
  failure_inbox: AutomationCoreData
  run_ledger: AutomationCoreData
}

export type ModuleData = ModuleDataMap[ModuleType]

// ---------------------------------------------------------------------------
// Triage Badge System
// ---------------------------------------------------------------------------

export type StatusDotColor = 'red' | 'yellow' | 'green'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'
export type WidgetBadge =
  | { type: 'status_dot'; color: StatusDotColor }
  | { type: 'priority_flag'; level: PriorityLevel }
  | { type: 'assignee_avatars'; initials: string[] }
  | { type: 'deadline_countdown'; dueDate: string }
  | { type: 'tag_pill'; tags: Array<{ label: string; color: string }> }

/** Focus-mode island arrangement — order and per-island size overrides,
 *  keyed by the island's stable id (`data-island` or its slot index). */
export interface IslandLayout {
  order?: string[]
  sizes?: Record<string, { width?: number; height?: number }>
}

export interface WidgetMetadata {
  badges: WidgetBadge[]
  locked?: boolean
  accent?: string
  zIndex?: number
  /** @deprecated Superseded by `islandLayout`; retained so old boards parse. */
  panelSizes?: Record<string, Size>
  /** Focus-mode island arrangement (glass constitution, Article XVIII). */
  islandLayout?: IslandLayout
  /** Original local-interpreter input, retained for reversibility and future re-interpretation. */
  sourceText?: string
  interpretationConfidence?: number
}

// ---------------------------------------------------------------------------
// Widget — the primary spatial entity (flat: one module type per card)
// ---------------------------------------------------------------------------

export interface Widget {
  id: string
  /** The single module type this widget renders. */
  type: ModuleType
  title: string
  /** The canvas this widget lives on. */
  canvasId: string
  /** Top-left corner in world coordinates. */
  position: Vector2D
  /** Width and height in world units; both snapped to GRID_SIZE multiples. */
  size: Size
  data: ModuleData
  metadata: WidgetMetadata
  /** Collapsed to a name pill. `size` holds the pill dims so all geometry
      (relations, hulls, culling) stays correct; the card size to restore
      on expand lives in `expandedSize`. */
  collapsed?: boolean
  /** Shrunk to a bare icon tile; mutually exclusive with `collapsed`. */
  iconified?: boolean
  expandedSize?: Size
  isHydrating?: boolean
}


/** Fallback pill dimensions of a collapsed widget (grid-aligned). The live
    pill width is measured from the title via pillSizeForTitle(). */
export const COLLAPSED_SIZE: Size = { width: 200, height: 40 }

/** Icon-tile dimensions of an iconified widget (two grid cells square). */
export const ICONIFIED_SIZE: Size = { width: 80, height: 80 }

// ---------------------------------------------------------------------------
// Widget Groups
// ---------------------------------------------------------------------------

export const GROUP_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

export interface WidgetGroup {
  id: string
  label: string
  widgetIds: string[]
  color: GroupColor
}

// ---------------------------------------------------------------------------
// Command Palette Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string
  type: 'widget' | 'action'
  title: string
  subtitle: string
  position: Vector2D
  /** Canvas the widget lives on — jump navigates there first when it differs. */
  canvasId?: string
}
